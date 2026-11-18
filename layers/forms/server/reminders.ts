// Reminders (form builder specification, part 5, "Notifications"): a nudge to somebody whose
// response waits on them, and to a reviewer whose review is still owed. A daily task. Each reminder
// is recorded on its row in the unit that sends it and carries a dedupe key, so a second run sends
// nothing more, and each goes once:
// - an unfinished working copy left untouched for `reminders.unfinished`;
// - an unfinished working copy on a form that closes within `reminders.closing` (a copy due both
//   on the same day is sent only this one);
// - a response returned for changes and not sent back within `reminders.returned`, once for each
//   time it is returned; somebody who answered signed out is sent a fresh link with it (R-19);
// - a review in an open round still not given after `reminders.review`.
// Nothing is sent once the thing it is about is done: the answers sent, the form paused or closed,
// the response moved on, the round closed. A working copy kept by somebody signed out lives on
// their device, so nobody knows to remind them. A returned response can be sent back after its form
// closes, so a closing date is no reason to remind about one.
import { all, siteUrl, theatreTimeZone, useSetting, type UnitView } from '#kit'
import { notify, notifyAddress } from '#modules/core'
import { issueChangeLink } from './changes'

const SECOND = 1000 // not-policy: settings are whole seconds
const BATCH = 200 // not-policy: one run's share, to keep the unit small; the next run takes the rest
const GUESTS = 8 // not-policy: each email to an address is its own few statements, so a run takes a unit's share and the next the rest

type ReminderSetting = 'forms.reminders.unfinished' | 'forms.reminders.closing' | 'forms.reminders.returned' | 'forms.reminders.review'
const lengthOf = async (key: ReminderSetting) => (Number(await useSetting(key) ?? 0)) * SECOND

/** How a closing date reads in a message, in the theatre's language and time zone. */
async function formatter(): Promise<(at: number) => string> {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  return (at: number) => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone }).format(at)
}

const json = (ids: string[]) => JSON.stringify(ids)

interface Unfinished { id: string, personId: string, title: string, slug: string, placementId: string, own: number, closesAt: number | null, touchedAt: number, remindedWaitingAt: number | null, remindedClosingAt: number | null }

/** Working copies of signed-in people, on forms that can still be answered. */
async function unfinished(unit: UnitView, at: number): Promise<number> {
  const idle = await lengthOf('forms.reminders.unfinished')
  const closing = await lengthOf('forms.reminders.closing')
  if (!idle && !closing) return 0
  // Due a closing reminder: not yet sent one, and the form closes within the time. Due the other:
  // sent neither, and untouched for the time.
  const due: string[] = []
  const params: number[] = [at, at]
  if (closing) {
    due.push('(r.reminded_closing_at IS NULL AND p.closes_at IS NOT NULL AND p.closes_at - ? <= ?)')
    params.push(at, closing)
  }
  if (idle) {
    due.push('(r.reminded_waiting_at IS NULL AND r.reminded_closing_at IS NULL AND d.updated_at <= ?)')
    params.push(at - idle)
  }
  const rows = await all<Unfinished>(
    `SELECT r.id, r.person_id AS personId, f.title, f.slug, p.id AS placementId, (p.slot_key = 'forms.link' AND p.subject_type IS NULL) AS own, p.closes_at AS closesAt,
       d.updated_at AS touchedAt, r.reminded_waiting_at AS remindedWaitingAt, r.reminded_closing_at AS remindedClosingAt
     FROM forms_responses r JOIN forms_response_drafts d ON d.response_id = r.id JOIN forms_forms f ON f.id = r.form_id JOIN forms_placements p ON p.id = r.placement_id
     WHERE r.state = 'draft' AND r.person_id IS NOT NULL AND f.status = 'live' AND p.status = 'active'
       AND (p.opens_at IS NULL OR p.opens_at <= ?) AND (p.closes_at IS NULL OR p.closes_at > ?) AND (p.response_cap IS NULL OR p.response_count < p.response_cap)
       AND (${due.join(' OR ')})
     ORDER BY r.id LIMIT ${BATCH}`, ...params)
  if (!rows.length) return 0
  const closes = (r: Unfinished) => !!closing && r.remindedClosingAt === null && r.closesAt !== null && r.closesAt - at <= closing
  const format = await formatter()
  const link = (r: Unfinished) => siteUrl(r.own ? `/forms/${r.slug}` : `/forms/${r.slug}?place=${r.placementId}`)
  const closingRows = rows.filter(closes)
  const idleRows = rows.filter(r => !closes(r))
  if (closingRows.length) {
    await notify(unit, 'forms.closing-reminder', {
      to: await Promise.all(closingRows.map(async r => ({ accountId: r.personId, variables: { form: r.title, closes: format(r.closesAt!), link: await link(r) }, dedupeKey: `closing:${r.id}` }))),
    })
    unit.add({ sql: 'UPDATE forms_responses SET reminded_closing_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND state = \'draft\' AND reminded_closing_at IS NULL', params: [at, json(closingRows.map(r => r.id))] })
  }
  if (idleRows.length) {
    await notify(unit, 'forms.unfinished-reminder', {
      to: await Promise.all(idleRows.map(async r => ({ accountId: r.personId, variables: { form: r.title, link: await link(r) }, dedupeKey: `unfinished:${r.id}` }))),
    })
    unit.add({ sql: 'UPDATE forms_responses SET reminded_waiting_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND state = \'draft\' AND reminded_waiting_at IS NULL', params: [at, json(idleRows.map(r => r.id))] })
  }
  return rows.length
}

export interface Returned { id: string, reference: string, personId: string | null, respondentEmail: string | null, title: string, returnedAt: number }

/** Responses returned for changes and not yet sent back, whose person has not been reminded since the return. */
export async function returnedDue(at: number, guests: boolean): Promise<Returned[]> {
  const after = await lengthOf('forms.reminders.returned')
  if (!after) return []
  const who = guests ? 'r.person_id IS NULL AND r.respondent_email IS NOT NULL' : 'r.person_id IS NOT NULL'
  return all<Returned>(
    `SELECT * FROM (
       SELECT r.id, r.reference, r.person_id AS personId, r.respondent_email AS respondentEmail, f.title, r.reminded_waiting_at AS reminded,
         (SELECT max(h.at) FROM forms_stage_history h WHERE h.response_id = r.id) AS returnedAt
       FROM forms_responses r JOIN forms_forms f ON f.id = r.form_id
       WHERE r.state = 'submitted' AND r.stage_kind = 'returned' AND r.anonymised_at IS NULL AND f.anonymous = 0 AND ${who})
     WHERE returnedAt <= ? AND (reminded IS NULL OR reminded < returnedAt)
     ORDER BY id LIMIT ${BATCH}`, at - after)
}

/** Marks these responses reminded for the return they are in now. */
export function markReturnedReminded(unit: UnitView, ids: string[], at: number): void {
  if (ids.length) unit.add({ sql: 'UPDATE forms_responses SET reminded_waiting_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND stage_kind = \'returned\'', params: [at, json(ids)] })
}

async function returned(unit: UnitView, at: number): Promise<number> {
  const rows = await returnedDue(at, false)
  if (!rows.length) return 0
  await notify(unit, 'forms.returned-reminder', {
    to: await Promise.all(rows.map(async r => ({ accountId: r.personId!, variables: { form: r.title, reference: r.reference, link: await siteUrl(`/account/forms/${r.id}`) }, dedupeKey: `returned:${r.id}:${r.returnedAt}` }))),
  })
  markReturnedReminded(unit, rows.map(r => r.id), at)
  return rows.length
}

/**
 * The same for somebody who answered signed out: a fresh link to make their changes through
 * (R-19), which replaces the one sent with the return, so a link that has run out is renewed once.
 */
async function returnedGuests(unit: UnitView, at: number): Promise<number> {
  const rows = (await returnedDue(at, true)).slice(0, GUESTS)
  for (const r of rows) {
    const link = await issueChangeLink(unit, r.id, at)
    await notifyAddress(unit, 'forms.returned-reminder-guest', { address: r.respondentEmail!, variables: { form: r.title, reference: r.reference, link }, record: ['forms.response', r.id], dedupeKey: `returned:${r.id}:${r.returnedAt}` })
  }
  markReturnedReminded(unit, rows.map(r => r.id), at)
  return rows.length
}

/** Reviews in open rounds, not yet given, asked for at least `reminders.review` ago. A reviewer with a conflict owes none. */
async function reviews(unit: UnitView, at: number): Promise<number> {
  const after = await lengthOf('forms.reminders.review')
  if (!after) return 0
  const rows = await all<{ id: string, reviewerId: string, title: string }>(
    `SELECT a.id, a.reviewer_id AS reviewerId, f.title
     FROM forms_review_assignments a JOIN forms_review_rounds n ON n.id = a.round_id JOIN forms_responses r ON r.id = a.response_id JOIN forms_forms f ON f.id = a.form_id
     WHERE a.status = 'assigned' AND a.reminded_at IS NULL AND n.closed_at IS NULL AND n.released_at IS NULL AND r.state = 'submitted' AND a.created_at <= ?
     ORDER BY a.id LIMIT ${BATCH}`, at - after)
  if (!rows.length) return 0
  await notify(unit, 'forms.review-reminder', {
    to: await Promise.all(rows.map(async r => ({ accountId: r.reviewerId, variables: { form: r.title, link: await siteUrl(`/account/forms/review/${r.id}`) }, dedupeKey: `review-reminder:${r.id}` }))),
  })
  unit.add({ sql: 'UPDATE forms_review_assignments SET reminded_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND reminded_at IS NULL', params: [at, json(rows.map(r => r.id))] })
  return rows.length
}

/** Sends every reminder that is due. Returns how many were sent. Safe to run any number of times. */
export async function sendReminders(unit: UnitView, at: number): Promise<number> {
  return await unfinished(unit, at) + await returned(unit, at) + await returnedGuests(unit, at) + await reviews(unit, at)
}
