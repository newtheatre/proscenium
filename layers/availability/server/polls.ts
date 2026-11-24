// Polls (rules F7 and F8): a find's shortlist of 2 to 6 slots sent to its people, who answer yes, if
// need be or no per slot. Answers never change availability; only the organiser sees anyone else's.
import { sql } from 'drizzle-orm'
import { can, first, inAccountScope, newId, nowMs, refuse, theatreTimeZone, useDb, useSetting, type Actor, type UnitView } from '#kit'
import { instantOfLocal, localDateOf, localParts } from '#kit/clock'
import { notify } from '#modules/core'
import { SLOTS_MAX, SLOTS_MIN, worstBetween } from '../shared/find'
import { addDays, clockOf, DAY_MINUTES } from '../shared/grid'
import type { PollState, ShownLevel, Unmarked, Vote } from '../shared/levels'
import { findPeople, findSlots } from './db/schema'
import { entryDates } from './entries'
import { MUST_MAX, peopleOf } from './find'
import { resolveDay } from './levels'
import { rowsOf } from './reading'

const MINUTE_MS = 60_000 // not-policy: a minute

export interface PollInput { title: string, groupIds: string[], accountIds: string[], must: string[], spaceIds: string[], length: number, slots: { date: string, start: number }[], answersBy: string }

interface FindRow { id: string, title: string, length_minutes: number, created_by: string, answers_by: number, state: PollState, decided_slot_id: string | null, decided_at: number | null, abandoned_at: number | null }
export interface PollSlot { id: string, date: string, start: number, end: number }

const local = async (ms: number) => {
  const zone = await theatreTimeZone()
  const p = localParts(ms, zone)
  return { date: localDateOf(ms, zone), start: p.hour * 60 + p.minute } // not-policy: minutes in an hour
}

async function slotsOf(findId: string, length: number): Promise<PollSlot[]> {
  const rows = await useDb().all<{ id: string, starts_at: number }>(sql`SELECT id, starts_at FROM availability_find_slots WHERE find_id = ${findId} ORDER BY starts_at`)
  return Promise.all(rows.map(async (r) => {
    const at = await local(r.starts_at)
    return { id: r.id, ...at, end: at.start + length }
  }))
}

const words = (f: { id: string, title: string }, extra: Record<string, string> = {}) => ({ title: f.title, poll: f.id, ...extra })

const whenOf = async (slot: PollSlot) => {
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const day = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.parse(`${slot.date}T12:00:00Z`))
  return `${day}, ${clockOf(slot.start)} to ${clockOf(slot.end)}`
}

const peopleIds = async (findId: string) => (await useDb().all<{ account_id: string }>(sql`SELECT account_id FROM availability_find_people WHERE find_id = ${findId}`)).map(p => p.account_id)

/** F7: stores the find, its slots and its people in the caller's unit, and tells everyone but the organiser once. */
export async function sendPoll(unit: UnitView, viewer: Actor, input: PollInput): Promise<{ pollId: string, asked: number }> {
  const step = Number(await useSetting('availability.grid.step'))
  const zone = await theatreTimeZone()
  const { today } = await entryDates()
  const keys = new Set(input.slots.map(s => `${s.date} ${s.start}`))
  if (input.slots.length < SLOTS_MIN || input.slots.length > SLOTS_MAX || keys.size !== input.slots.length)
    refuse('availability.poll.slots', `A poll offers ${SLOTS_MIN} to ${SLOTS_MAX} different times.`, { status: 422 })
  if (input.length % step || input.slots.some(s => s.start % step || s.start + input.length > DAY_MINUTES))
    refuse('availability.length', 'The length must fit the hours on the grid step.', { status: 422 })
  if (input.answersBy < today) refuse('availability.poll.answers-past', 'The answer date cannot be in the past.', { status: 422 })
  if (input.must.length > MUST_MAX) refuse('availability.too-many-must', `At most ${MUST_MAX} must-have people.`, { status: 422 })
  const now = nowMs()
  const starts = input.slots.map(s => instantOfLocal(s.date, clockOf(s.start), zone))
  if (starts.some(at => at <= now)) refuse('availability.poll.past', 'Every time offered must be in the future.', { status: 422 })
  const { ids } = await peopleOf(viewer, input)
  if (!ids.length) refuse('availability.request.nobody', 'Nobody would be asked.', { status: 422, remedy: 'Choose a group with people in it.' })

  const id = newId('avfd')
  const answersBy = instantOfLocal(addDays(input.answersBy, 1), '00:00', zone)
  unit.add(sql`INSERT INTO availability_finds (id, title, length_minutes, group_refs, space_ids, created_by, answers_by, state, created_at, updated_at)
    VALUES (${id}, ${input.title}, ${input.length}, ${JSON.stringify(input.groupIds)}, ${JSON.stringify(input.spaceIds)}, ${viewer.accountId!}, ${answersBy}, 'polling', ${now}, ${now})`)
  unit.insertSet(findPeople, ids.map(accountId => ({ findId: id, accountId, mustHave: input.must.includes(accountId) })))
  unit.insertSet(findSlots, starts.map(at => ({ findId: id, startsAt: at, endsAt: at + input.length * MINUTE_MS })))
  const organiser = await first<{ name: string | null }>('SELECT name FROM core_accounts WHERE id = ?', viewer.accountId!)
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const due = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.parse(`${input.answersBy}T12:00:00Z`))
  const variables = words({ id, title: input.title }, { organiser: organiser?.name ?? '', due })
  const asked = ids.filter(a => a !== viewer.accountId)
  await notify(unit, 'availability.poll-asked', { to: asked.map(accountId => ({ accountId, variables, dedupeKey: `poll:${id}` })) })
  return { pollId: id, asked: asked.length }
}

async function requireFind(id: string): Promise<FindRow> {
  return await first<FindRow>('SELECT * FROM availability_finds WHERE id = ?', id) ?? refuse('availability.poll.not-found', 'There is no such poll.', { status: 404 })
}

const isOrganiser = async (f: FindRow, viewer: Actor) => f.created_by === viewer.accountId || (await can(viewer, 'availability.find.anyone')).allowed

async function organised(id: string, actor: Actor): Promise<FindRow> {
  const f = await requireFind(id)
  if (!await isOrganiser(f, actor)) refuse('availability.poll.not-yours', 'Only the person who sent it can do that.', { status: 403 })
  return f
}

const isAsked = async (findId: string, accountId: string) =>
  !!await useDb().get(sql`SELECT 1 FROM availability_find_people WHERE find_id = ${findId} AND ${inAccountScope('account_id', accountId)}`)

export interface PollView {
  poll: { id: string, title: string, length: number, answersBy: number, state: PollState, open: boolean, decidedSlotId: string | null, organiser: string }
  slots: PollSlot[]
  organiser: boolean
  asked: boolean
  mine: Record<string, Vote>
  myLevels: Record<string, ShownLevel>
  tallies?: Record<string, Record<Vote, number>>
  people?: { accountId: string, name: string, must: boolean, answers: Record<string, Vote> }[]
}

/** The viewer's own level over each slot, for S9 (AV-15). */
async function myLevels(accountId: string, slots: PollSlot[]): Promise<Record<string, ShownLevel>> {
  if (!slots.length) return {}
  const dates = slots.map(s => s.date).sort()
  const rows = (await rowsOf([accountId], dates[0]!, dates.at(-1)!)).get(accountId)!
  const fallback = rows.unmarked ?? await useSetting('availability.entry.unmarked-default') as Unmarked
  return Object.fromEntries(slots.map(s => [s.id, worstBetween(resolveDay(s.date, rows.lines, rows.exceptions, fallback, () => true), s.start, s.end)]))
}

/** S8 for the organiser, S9 for a person asked; anyone else is told there is no such poll. */
export async function pollView(id: string, viewer: Actor): Promise<PollView> {
  const f = await requireFind(id)
  const organiser = await isOrganiser(f, viewer)
  const asked = await isAsked(id, viewer.accountId!)
  if (!organiser && !asked) refuse('availability.poll.not-found', 'There is no such poll.', { status: 404 })
  const slots = await slotsOf(id, f.length_minutes)
  const votes = await useDb().all<{ slot_id: string, account_id: string, answer: Vote }>(sql`SELECT v.slot_id, v.account_id, v.answer FROM availability_find_votes v
    JOIN availability_find_slots s ON s.id = v.slot_id WHERE s.find_id = ${id}${organiser ? sql`` : sql` AND ${inAccountScope('v.account_id', viewer.accountId!)}`}`)
  const mine = Object.fromEntries(votes.filter(v => v.account_id === viewer.accountId).map(v => [v.slot_id, v.answer]))
  const names = await useDb().all<{ id: string, name: string | null }>(sql`SELECT id, name FROM core_accounts WHERE id = ${f.created_by}`)
  const view: PollView = {
    poll: { id, title: f.title, length: f.length_minutes, answersBy: f.answers_by, state: f.state, open: f.state === 'polling' && f.answers_by > nowMs(), decidedSlotId: f.decided_slot_id, organiser: names[0]?.name ?? '' },
    slots,
    organiser,
    asked,
    mine,
    myLevels: asked ? await myLevels(viewer.accountId!, slots) : {},
  }
  if (!organiser) return view
  const people = await useDb().all<{ account_id: string, must_have: number, name: string | null }>(sql`SELECT p.account_id, p.must_have, a.name FROM availability_find_people p
    LEFT JOIN core_accounts a ON a.id = p.account_id WHERE p.find_id = ${id} ORDER BY a.name, p.account_id`)
  view.tallies = Object.fromEntries(slots.map(s => [s.id, { 'yes': 0, 'if-need-be': 0, 'no': 0 }]))
  votes.forEach(v => view.tallies![v.slot_id]![v.answer]++)
  view.people = people.map(p => ({ accountId: p.account_id, name: p.name ?? '', must: !!p.must_have, answers: Object.fromEntries(votes.filter(v => v.account_id === p.account_id).map(v => [v.slot_id, v.answer])) }))
  return view
}

/** F7: one save of the person's answers; changeable until the poll closes. */
export async function vote(unit: UnitView, id: string, viewer: Actor, answers: { slotId: string, answer: Vote }[]): Promise<void> {
  await requireFind(id)
  if (!await isAsked(id, viewer.accountId!)) refuse('availability.poll.not-found', 'There is no such poll.', { status: 404 })
  const slots = new Set((await useDb().all<{ id: string }>(sql`SELECT id FROM availability_find_slots WHERE find_id = ${id}`)).map(s => s.id))
  if (answers.some(a => !slots.has(a.slotId))) refuse('availability.poll.slot', 'That time is not part of this poll.', { status: 422 })
  const at = nowMs()
  unit.add(sql`UPDATE availability_finds SET updated_at = ${at} WHERE id = ${id} AND state = 'polling' AND answers_by > ${at}`)
    .expect(1, { code: 'availability.poll.closed', reason: 'This poll is no longer taking answers.' })
  for (const a of answers) {
    unit.add(sql`INSERT INTO availability_find_votes (id, slot_id, account_id, answer, created_at, updated_at)
      VALUES (${newId('avfv')}, ${a.slotId}, ${viewer.accountId!}, ${a.answer}, ${at}, ${at})
      ON CONFLICT (slot_id, account_id) DO UPDATE SET answer = excluded.answer, updated_at = excluded.updated_at`)
  }
}

/** F8: the organiser settles on any slot at any time; everyone asked is told. */
export async function decide(unit: UnitView, id: string, slotId: string, actor: Actor): Promise<void> {
  const f = await organised(id, actor)
  const slot = (await slotsOf(id, f.length_minutes)).find(s => s.id === slotId) ?? refuse('availability.poll.slot', 'That time is not part of this poll.', { status: 422 })
  const at = nowMs()
  unit.add(sql`UPDATE availability_finds SET state = 'decided', decided_slot_id = ${slotId}, decided_at = ${at}, updated_at = ${at} WHERE id = ${id} AND state = 'polling'`)
    .expect(1, { code: 'availability.poll.finished', reason: 'This poll is already decided or given up.' })
  const starts = instantOfLocal(slot.date, clockOf(slot.start), await theatreTimeZone())
  unit.announce('availability.poll.decided', { findId: id, from: starts, to: starts + f.length_minutes * MINUTE_MS }, { record: ['availability.find', id] })
  const variables = words(f, { when: await whenOf(slot) })
  await notify(unit, 'availability.poll-decided', { to: (await peopleIds(id)).filter(a => a !== f.created_by).map(accountId => ({ accountId, variables, dedupeKey: `poll-decided:${id}` })) })
}

/** F8: the organiser gives the poll up; everyone asked is told. */
export async function abandon(unit: UnitView, id: string, actor: Actor): Promise<void> {
  const f = await organised(id, actor)
  const at = nowMs()
  unit.add(sql`UPDATE availability_finds SET state = 'abandoned', abandoned_at = ${at}, updated_at = ${at} WHERE id = ${id} AND state = 'polling'`)
    .expect(1, { code: 'availability.poll.finished', reason: 'This poll is already decided or given up.' })
  const variables = words(f)
  await notify(unit, 'availability.poll-abandoned', { to: (await peopleIds(id)).filter(a => a !== f.created_by).map(accountId => ({ accountId, variables, dedupeKey: `poll-abandoned:${id}` })) })
}

/** F8, daily: a poll undecided `polls.abandon-after` past its answer time is given up; all are told once. Then retention. */
export async function sweepPolls(unit: UnitView): Promise<number> {
  const after = (await useSetting('availability.polls.abandon-after') as number) * 1000 // not-policy: settings are seconds
  const at = nowMs()
  const stale = await useDb().all<FindRow>(sql`SELECT * FROM availability_finds WHERE state = 'polling' AND answers_by + ${after} < ${at}`)
  for (const f of stale) {
    unit.add(sql`UPDATE availability_finds SET state = 'abandoned', abandoned_at = ${at}, updated_at = ${at} WHERE id = ${f.id} AND state = 'polling'`)
    const variables = words(f)
    await notify(unit, 'availability.poll-abandoned', { to: (await peopleIds(f.id)).filter(a => a !== f.created_by).map(accountId => ({ accountId, variables, dedupeKey: `poll-abandoned:${f.id}` })) })
    await notify(unit, 'availability.poll-expired', { to: [{ accountId: f.created_by, variables, dedupeKey: `poll-expired:${f.id}` }] })
  }
  const keep = (await useSetting('availability.retention.history') as number) * 1000 // not-policy: settings are seconds
  const old = sql`SELECT id FROM availability_finds WHERE state <> 'polling' AND coalesce(decided_at, abandoned_at) < ${at - keep}`
  unit.add(sql`DELETE FROM availability_find_votes WHERE slot_id IN (SELECT id FROM availability_find_slots WHERE find_id IN (${old}))`)
  unit.add(sql`DELETE FROM availability_find_slots WHERE find_id IN (${old})`)
  unit.add(sql`DELETE FROM availability_find_people WHERE find_id IN (${old})`)
  unit.add(sql`DELETE FROM availability_finds WHERE id IN (${old})`)
  return stale.length
}

export interface PollRow { id: string, title: string, answersBy: number, state: PollState, open: boolean, answered: number, asked: number }

/** S4: the polls asking this person, open ones first. `answered` is 1 once they have answered any slot. */
export async function myPolls(accountId: string): Promise<PollRow[]> {
  const rows = await useDb().all<{ id: string, title: string, answers_by: number, state: PollState, answered: number }>(sql`SELECT f.id, f.title, f.answers_by, f.state,
    EXISTS (SELECT 1 FROM availability_find_votes v JOIN availability_find_slots s ON s.id = v.slot_id WHERE s.find_id = f.id AND ${inAccountScope('v.account_id', accountId)}) AS answered
    FROM availability_find_people p JOIN availability_finds f ON f.id = p.find_id WHERE ${inAccountScope('p.account_id', accountId)}
    ORDER BY f.state = 'polling' DESC, f.answers_by DESC, f.id`)
  const now = nowMs()
  return rows.map(r => ({ id: r.id, title: r.title, answersBy: r.answers_by, state: r.state, open: r.state === 'polling' && r.answers_by > now, answered: r.answered, asked: 1 }))
}

/** S7's list of the viewer's own polls, with how many of the people asked have answered. */
export async function sentPolls(viewer: Actor): Promise<PollRow[]> {
  const rows = await useDb().all<{ id: string, title: string, answers_by: number, state: PollState, answered: number, asked: number }>(sql`SELECT f.id, f.title, f.answers_by, f.state,
    (SELECT count(*) FROM availability_find_people p WHERE p.find_id = f.id) AS asked,
    (SELECT count(DISTINCT v.account_id) FROM availability_find_votes v JOIN availability_find_slots s ON s.id = v.slot_id WHERE s.find_id = f.id) AS answered
    FROM availability_finds f WHERE ${inAccountScope('f.created_by', viewer.accountId!)} ORDER BY f.state = 'polling' DESC, f.created_at DESC, f.id`)
  const now = nowMs()
  return rows.map(r => ({ id: r.id, title: r.title, answersBy: r.answers_by, state: r.state, open: r.state === 'polling' && r.answers_by > now, answered: r.answered, asked: r.asked }))
}
