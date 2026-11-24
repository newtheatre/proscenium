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

interface RequestRow { id: string, title: string, from_date: string, to_date: string, due_on: string, source_ref: string | null, opened_by: string, state: 'open' | 'closed', group_refs: string }

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) // not-policy: a day

/** The people a request asks: every member of its groups and the people named, by subquery. */
async function members(groupIds: string[], accountIds: string[]): Promise<string[]> {
  const parts: SQL[] = [sql`SELECT value AS id FROM json_each(${JSON.stringify(accountIds)})`]
  for (const g of groupIds) parts.push(sql`SELECT id FROM (${(await groupKind(g)).members(g)})`)
  const rows = await useDb().all<{ id: string }>(sql`SELECT DISTINCT coalesce((SELECT merged_into_id FROM core_accounts a WHERE a.id = m.id), m.id) AS id
    FROM (${sql.join(parts, sql` UNION `)}) m WHERE m.id IN (SELECT id FROM core_accounts WHERE disabled_at IS NULL AND anonymised_at IS NULL)`)
  return rows.map(r => r.id)
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
  unit.add(sql`INSERT INTO availability_requests (id, title, message, from_date, to_date, due_on, group_refs, source_ref, opened_by, state, created_at, updated_at)
    VALUES (${id}, ${input.title}, ${input.message}, ${input.from}, ${input.to}, ${input.dueOn}, ${JSON.stringify(input.groupIds)}, ${input.sourceRef}, ${input.openedBy}, 'open', ${at}, ${at})`)
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

/** R7 by hand: only the organiser, and only a request no module opened. */
export async function closeByHand(unit: UnitView, id: string, actor: Actor): Promise<void> {
  const r = await requireRequest(id)
  if (r.source_ref) refuse('availability.request.module', 'This request closes with the schedule it belongs to.', { status: 409 })
  if (r.opened_by !== actor.accountId && !(await can(actor, 'availability.find.anyone')).allowed) refuse('availability.request.not-yours', 'Only the person who opened it can close it.', { status: 403 })
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
  const organiser = r.opened_by === viewer.accountId || (await can(viewer, 'availability.find.anyone')).allowed
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
  const { today } = await entryDates()
  const at = nowMs()
  unit.add(sql`UPDATE availability_request_people SET state = 'lapsed', updated_at = ${at}
    WHERE state = 'asked' AND request_id IN (SELECT id FROM availability_requests WHERE state = 'open' AND due_on < ${today})`)
  unit.add(sql`UPDATE availability_requests SET state = 'closed', closed_at = ${at}, updated_at = ${at} WHERE state = 'open' AND to_date < ${today}`)
}
