// Availability requests (rules R1, R3 to R5, R7): a planner or a module asks people to check their
// availability over a period. Answering moves checked_to; closing stops reminders and nothing else.
import { sql, type SQL } from 'drizzle-orm'
import { can, first, inAccountScope, newId, nowMs, refuse, useDb, useSetting, type Actor, type UnitView } from '#kit'
import { notify } from '#modules/core'
import type { AskedState } from '../shared/levels'
import { requestPeople } from './db/schema'
import { entryDates } from './entries'
import { groupKind } from './planning'

const YEAR_DAYS = 366 // not-policy: rule R1's longest period

export interface OpenInput { sourceRef: string | null, groupIds: string[], accountIds: string[], from: string, to: string, dueOn: string, title: string, message: string | null, openedBy: string }

interface RequestRow { id: string, title: string, message: string | null, from_date: string, to_date: string, due_on: string, source_ref: string | null, opened_by: string, state: 'open' | 'closed', group_refs: string, account_refs: string, reminded_at: number | null }

const DAY_MS = 86_400_000 // not-policy: "Remind now" at most once a day (S11)

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) // not-policy: a day

/** A subquery of the live people a request asks: every member of its groups and the people named. */
async function membersSql(groupIds: string[], accountIds: string[]): Promise<SQL> {
  const parts: SQL[] = [sql`SELECT value AS id FROM json_each(${JSON.stringify(accountIds)})`]
  for (const g of groupIds) parts.push(sql`SELECT id FROM (${(await groupKind(g)).members(g)})`)
  return sql`SELECT DISTINCT coalesce((SELECT merged_into_id FROM core_accounts a WHERE a.id = m.id), m.id) AS id
    FROM (${sql.join(parts, sql` UNION `)}) m WHERE m.id IN (SELECT id FROM core_accounts WHERE disabled_at IS NULL AND anonymised_at IS NULL)`
}

async function members(groupIds: string[], accountIds: string[]): Promise<string[]> {
  return (await useDb().all<{ id: string }>(await membersSql(groupIds, accountIds))).map(r => r.id)
}

async function words(r: { title: string, from: string, to: string, dueOn: string }) {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' })
  const at = (d: string) => date.format(Date.parse(`${d}T12:00:00Z`))
  return { title: r.title, period: `${at(r.from)} to ${at(r.to)}`, due: at(r.dueOn) }
}

/**
 * R1: opens a request in the caller's unit, or answers the open one for the same source. Everyone
 * asked is written in one set and told once (R3).
 */
export async function openRequest(unit: UnitView, input: OpenInput): Promise<{ requestId: string, asked: number, existing: boolean }> {
  if (input.sourceRef) {
    const open = await first<{ id: string }>('SELECT id FROM availability_requests WHERE source_ref = ? AND state = \'open\'', input.sourceRef)
    if (open) return { requestId: open.id, asked: 0, existing: true }
  }
  const { today } = await entryDates()
  if (input.to < input.from || days(input.from, input.to) > YEAR_DAYS) refuse('availability.request.period', `A request covers at most ${YEAR_DAYS} days.`, { status: 422 })
  if (input.dueOn < today) refuse('availability.request.due-past', 'The answer date cannot be in the past.', { status: 422 })
  const people = await members(input.groupIds, input.accountIds)
  if (!people.length) refuse('availability.request.nobody', 'Nobody would be asked.', { status: 422, remedy: 'Choose a group with people in it.' })
  const id = newId('avrq')
  const at = nowMs()
  unit.add(sql`INSERT INTO availability_requests (id, title, message, from_date, to_date, due_on, group_refs, account_refs, source_ref, opened_by, state, created_at, updated_at)
    VALUES (${id}, ${input.title}, ${input.message}, ${input.from}, ${input.to}, ${input.dueOn}, ${JSON.stringify(input.groupIds)}, ${JSON.stringify(input.accountIds)}, ${input.sourceRef}, ${input.openedBy}, 'open', ${at}, ${at})`)
  unit.insertSet(requestPeople, people.map(accountId => ({ requestId: id, accountId, state: 'asked' })))
  unit.announce('availability.request.opened', { requestId: id }, { record: ['availability.request', id] })
  const variables = await words(input)
  await notify(unit, 'availability.request-opened', { to: people.map(accountId => ({ accountId, variables, dedupeKey: `request:${id}` })) })
  return { requestId: id, asked: people.length, existing: false }
}

/** R7: closes the open request for a source. Closing a closed one does nothing. */
export function closeRequest(unit: UnitView, sourceRef: string): void {
  unit.add(sql`UPDATE availability_requests SET state = 'closed', closed_at = ${nowMs()}, updated_at = ${nowMs()} WHERE source_ref = ${sourceRef} AND state = 'open'`)
}

export async function requireRequest(id: string): Promise<RequestRow> {
  return await first<RequestRow>('SELECT * FROM availability_requests WHERE id = ?', id) ?? refuse('availability.request.not-found', 'There is no such request.', { status: 404 })
}

const isOrganiser = async (r: RequestRow, viewer: Actor) => r.opened_by === viewer.accountId || (await can(viewer, 'availability.find.anyone')).allowed

/** The request, refused unless the actor opened it or may read anyone's availability. */
async function organised(id: string, actor: Actor): Promise<RequestRow> {
  const r = await requireRequest(id)
  if (!await isOrganiser(r, actor)) refuse('availability.request.not-yours', 'Only the person who opened it can do that.', { status: 403 })
  return r
}

/** R7 by hand: only the organiser, and only a request no module opened. */
export async function closeByHand(unit: UnitView, id: string, actor: Actor): Promise<void> {
  const r = await organised(id, actor)
  if (r.source_ref) refuse('availability.request.module', 'This request closes with the schedule it belongs to.', { status: 409 })
  unit.add(sql`UPDATE availability_requests SET state = 'closed', closed_at = ${nowMs()}, updated_at = ${nowMs()} WHERE id = ${id} AND state = 'open'`)
    .expect(1, { code: 'availability.request.closed', reason: 'This request is already closed.' })
  unit.announce('availability.request.closed', { requestId: id }, { record: ['availability.request', id] })
}

/** R4: "This is right". Answers the request, changed or not, and moves checked_to to its last date at least. */
export async function answer(unit: UnitView, id: string, accountId: string): Promise<void> {
  const r = await requireRequest(id)
  const at = nowMs()
  unit.add(sql`UPDATE availability_request_people SET state = 'answered', answered_at = ${at}, updated_at = ${at}
    WHERE request_id = ${id} AND ${inAccountScope('account_id', accountId)} AND state IN ('asked', 'lapsed', 'answered')`)
    .expect(1, { code: 'availability.request.not-asked', reason: 'You were not asked by this request.' })
  unit.add(sql`INSERT INTO availability_profiles (account_id, changed_at, checked_to, created_at, updated_at) VALUES (${accountId}, ${at}, ${r.to_date}, ${at}, ${at})
    ON CONFLICT (account_id) DO UPDATE SET checked_to = max(coalesce(checked_to, ''), excluded.checked_to), updated_at = excluded.updated_at`)
}

export interface Status { counts: Record<AskedState, number>, people?: { accountId: string, state: AskedState, answeredAt: number | null }[] }

/** Counts by state, and each person's state for the organiser or a planner (part 4). */
export async function requestStatus(sourceRefOrId: string, viewer: Actor): Promise<Status | null> {
  const r = await first<RequestRow>('SELECT * FROM availability_requests WHERE id = ?1 OR source_ref = ?1 ORDER BY state = \'open\' DESC, created_at DESC LIMIT 1', sourceRefOrId)
  if (!r) return null
  const rows = await useDb().all<{ account_id: string, state: AskedState, answered_at: number | null }>(sql`SELECT account_id, state, answered_at FROM availability_request_people WHERE request_id = ${r.id} ORDER BY created_at, id`)
  const counts = { asked: 0, answered: 0, lapsed: 0, withdrawn: 0 }
  rows.forEach(p => counts[p.state]++)
  const organiser = await isOrganiser(r, viewer)
  return { counts, ...(organiser ? { people: rows.map(p => ({ accountId: p.account_id, state: p.state, answeredAt: p.answered_at })) } : {}) }
}

/** The requests asking this person, newest first, for their own page. */
export async function myRequests(accountId: string): Promise<{ id: string, title: string, from: string, to: string, dueOn: string, state: AskedState, open: boolean }[]> {
  const rows = await useDb().all<{ id: string, title: string, from_date: string, to_date: string, due_on: string, state: AskedState, open: number }>(
    sql`SELECT r.id, r.title, r.from_date, r.to_date, r.due_on, p.state, r.state = 'open' AS open FROM availability_request_people p JOIN availability_requests r ON r.id = p.request_id
      WHERE ${inAccountScope('p.account_id', accountId)} AND p.state <> 'withdrawn' ORDER BY r.state = 'open' DESC, r.due_on, r.id`)
  return rows.map(r => ({ id: r.id, title: r.title, from: r.from_date, to: r.to_date, dueOn: r.due_on, state: r.state, open: !!r.open }))
}

/** R5 and R7, daily: asked becomes lapsed after the due date; a request closes after its last date. */
export async function sweepRequests(unit: UnitView): Promise<void> {
  await followGroups(unit)
  const { today } = await entryDates()
  const at = nowMs()
  unit.add(sql`UPDATE availability_request_people SET state = 'lapsed', updated_at = ${at}
    WHERE state = 'asked' AND request_id IN (SELECT id FROM availability_requests WHERE state = 'open' AND due_on < ${today})`)
  unit.add(sql`UPDATE availability_requests SET state = 'closed', closed_at = ${at}, updated_at = ${at} WHERE state = 'open' AND to_date < ${today}`)
}

/**
 * R2 and R6, daily: people who joined a chosen group are asked and told; people asked who are in
 * none of the groups any more, and were not named, are withdrawn. A group whose module is off is left alone.
 */
export async function followGroups(unit: UnitView): Promise<void> {
  const open = await useDb().all<RequestRow>(sql`SELECT * FROM availability_requests WHERE state = 'open' AND group_refs <> '[]'`)
  const at = nowMs()
  for (const r of open) {
    let current: SQL
    try {
      current = await membersSql(JSON.parse(r.group_refs) as string[], JSON.parse(r.account_refs) as string[])
    }
    catch {
      continue
    }
    const joiners = (await useDb().all<{ id: string }>(sql`SELECT id FROM (${current}) WHERE id NOT IN (SELECT account_id FROM availability_request_people WHERE request_id = ${r.id})`)).map(j => j.id)
    if (joiners.length) {
      unit.insertSet(requestPeople, joiners.map(accountId => ({ requestId: r.id, accountId, state: 'asked' as const })))
      const variables = await words({ title: r.title, from: r.from_date, to: r.to_date, dueOn: r.due_on })
      await notify(unit, 'availability.request-opened', { to: joiners.map(accountId => ({ accountId, variables, dedupeKey: `request:${r.id}` })) })
    }
    unit.add(sql`UPDATE availability_request_people SET state = 'withdrawn', updated_at = ${at}
      WHERE request_id = ${r.id} AND state IN ('asked', 'lapsed') AND account_id NOT IN (${current})`) // exact-account: both sides are survivors
  }
}

/** How many reminders a person still asked should have had by today: one per setting passed (R3). */
async function remindersDue(today: string): Promise<SQL> {
  const days = async (key: 'availability.requests.first-reminder' | 'availability.requests.second-reminder') => Math.round((await useSetting(key) as number) / (DAY_MS / 1000)) // not-policy: seconds in a millisecond day
  const [first, second] = [await days('availability.requests.first-reminder'), await days('availability.requests.second-reminder')]
  const left = sql`(julianday(r.due_on) - julianday(${today}))`
  return sql`((${first} > 0 AND ${left} <= ${first}) + (${second} > 0 AND ${left} <= ${second}))`
}

/** R3, hourly: one reminder to each person still asked who has passed a reminder setting since the last. */
export async function sendReminders(unit: UnitView): Promise<number> {
  const { today } = await entryDates()
  const due = await remindersDue(today)
  const where = sql`p.state = 'asked' AND r.state = 'open' AND r.due_on >= ${today} AND p.reminders_sent < ${due}`
  const people = await useDb().all<{ account_id: string, id: string, title: string, from_date: string, to_date: string, due_on: string, due: number }>(
    sql`SELECT p.account_id, r.id, r.title, r.from_date, r.to_date, r.due_on, ${due} AS due FROM availability_request_people p JOIN availability_requests r ON r.id = p.request_id WHERE ${where}`)
  const byRequest = new Map<string, typeof people>()
  for (const p of people) byRequest.set(p.id, [...byRequest.get(p.id) ?? [], p])
  for (const [id, asked] of byRequest) {
    const r = asked[0]!
    const variables = await words({ title: r.title, from: r.from_date, to: r.to_date, dueOn: r.due_on })
    await notify(unit, 'availability.request-reminder', { to: asked.map(p => ({ accountId: p.account_id, variables, dedupeKey: `reminder:${id}:${p.due}` })) })
  }
  unit.add(sql`UPDATE availability_request_people AS p SET reminders_sent = (SELECT ${due} FROM availability_requests r WHERE r.id = p.request_id), updated_at = ${nowMs()}
    WHERE p.id IN (SELECT p.id FROM availability_request_people p JOIN availability_requests r ON r.id = p.request_id WHERE ${where})`)
  return people.length
}

/** S11 "Remind now": everyone still asked, at most once a day, only while the request is open. */
export async function remindNow(unit: UnitView, id: string, actor: Actor): Promise<{ reminded: number }> {
  const r = await organised(id, actor)
  if (r.state !== 'open') refuse('availability.request.closed', 'This request is already closed.', { status: 409 })
  const at = nowMs()
  unit.add(sql`UPDATE availability_requests SET reminded_at = ${at}, updated_at = ${at} WHERE id = ${id} AND state = 'open' AND (reminded_at IS NULL OR reminded_at <= ${at - DAY_MS})`)
    .expect(1, { code: 'availability.request.reminded-today', reason: 'A reminder went less than a day ago.', remedy: 'Try again tomorrow.' })
  const asked = await useDb().all<{ account_id: string }>(sql`SELECT account_id FROM availability_request_people WHERE request_id = ${id} AND state = 'asked'`)
  const variables = await words({ title: r.title, from: r.from_date, to: r.to_date, dueOn: r.due_on })
  if (asked.length) await notify(unit, 'availability.request-reminder', { to: asked.map(p => ({ accountId: p.account_id, variables, dedupeKey: `remind-now:${id}:${at}` })) })
  return { reminded: asked.length }
}

/** R6 by hand: the organiser stops asking one person. */
export async function withdraw(unit: UnitView, id: string, accountId: string, actor: Actor): Promise<void> {
  await organised(id, actor)
  unit.add(sql`UPDATE availability_request_people SET state = 'withdrawn', updated_at = ${nowMs()} WHERE request_id = ${id} AND ${inAccountScope('account_id', accountId)} AND state <> 'withdrawn'`)
    .expect(1, { code: 'availability.request.not-asked', reason: 'This person is not asked by this request.' })
}

export interface SentRow { id: string, title: string, from: string, to: string, dueOn: string, open: boolean, module: boolean, counts: Record<AskedState, number> }

/** S11: the requests this person opened, open ones first, with counts by state. */
export async function sentRequests(accountId: string): Promise<SentRow[]> {
  const rows = await useDb().all<{ id: string, title: string, from_date: string, to_date: string, due_on: string, state: string, source_ref: string | null, asked: number, answered: number, lapsed: number, withdrawn: number }>(
    sql`SELECT r.id, r.title, r.from_date, r.to_date, r.due_on, r.state, r.source_ref,
      (SELECT count(*) FROM availability_request_people p WHERE p.request_id = r.id AND p.state = 'asked') AS asked,
      (SELECT count(*) FROM availability_request_people p WHERE p.request_id = r.id AND p.state = 'answered') AS answered,
      (SELECT count(*) FROM availability_request_people p WHERE p.request_id = r.id AND p.state = 'lapsed') AS lapsed,
      (SELECT count(*) FROM availability_request_people p WHERE p.request_id = r.id AND p.state = 'withdrawn') AS withdrawn
      FROM availability_requests r WHERE ${inAccountScope('r.opened_by', accountId)} ORDER BY r.state = 'open' DESC, r.due_on DESC, r.id`)
  return rows.map(r => ({ id: r.id, title: r.title, from: r.from_date, to: r.to_date, dueOn: r.due_on, open: r.state === 'open', module: !!r.source_ref,
    counts: { asked: r.asked, answered: r.answered, lapsed: r.lapsed, withdrawn: r.withdrawn } }))
}

export interface RequestView {
  request: { id: string, title: string, message: string | null, from: string, to: string, dueOn: string, open: boolean, module: boolean, remindedAt: number | null }
  /** The viewer's own state when asked. */
  mine: AskedState | null
  organiser: boolean
  counts: Record<AskedState, number>
  /** Each person and their state, for the organiser only. */
  people?: { accountId: string, name: string, state: AskedState, answeredAt: number | null }[]
}

/** S5 and S11's detail: the request for someone it asks, or in full for its organiser. */
export async function requestView(id: string, viewer: Actor): Promise<RequestView> {
  const r = await requireRequest(id)
  const organiser = await isOrganiser(r, viewer)
  const rows = await useDb().all<{ account_id: string, name: string | null, anonymised_at: number | null, state: AskedState, answered_at: number | null }>(
    sql`SELECT p.account_id, a.name, a.anonymised_at, p.state, p.answered_at FROM availability_request_people p JOIN core_accounts a ON a.id = p.account_id
      WHERE p.request_id = ${id} ORDER BY a.name COLLATE NOCASE, p.id`)
  const mine = viewer.accountId ? (await useDb().get<{ state: AskedState }>(sql`SELECT state FROM availability_request_people WHERE request_id = ${id} AND ${inAccountScope('account_id', viewer.accountId)}`))?.state ?? null : null
  if (!organiser && !mine) refuse('availability.request.not-found', 'There is no such request.', { status: 404 })
  const counts = { asked: 0, answered: 0, lapsed: 0, withdrawn: 0 }
  rows.forEach(p => counts[p.state]++)
  return {
    request: { id: r.id, title: r.title, message: r.message, from: r.from_date, to: r.to_date, dueOn: r.due_on, open: r.state === 'open', module: !!r.source_ref, remindedAt: r.reminded_at },
    mine,
    organiser,
    counts,
    ...(organiser ? { people: rows.map(p => ({ accountId: p.account_id, name: p.anonymised_at ? '' : p.name ?? '', state: p.state, answeredAt: p.answered_at })) } : {}),
  }
}
