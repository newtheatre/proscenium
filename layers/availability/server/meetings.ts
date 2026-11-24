// Arranged meetings (rules M1 to M5): a time, a place and an agenda for people the organiser plans
// for. Invitees answer going or not going; anyone not saying not going is busy, firm, for it.
import { sql } from 'drizzle-orm'
import { can, first, inAccountScope, newId, nowMs, refuse, theatreTimeZone, useDb, useSetting, type Actor, type UnitView } from '#kit'
import { instantOfLocal, localDateOf, localParts } from '#kit/clock'
import { notify } from '#modules/core'
import { addDays, clockOf, DAY_MINUTES } from '../shared/grid'
import type { MeetingState, Response } from '../shared/levels'
import { meetingInvitees } from './db/schema'
import { peopleOf } from './find'

export interface MeetingTime { date: string, start: number, end: number }
export interface ArrangeInput extends MeetingTime { title: string, place: string | null, notes: string | null, groupIds: string[], accountIds: string[], findId: string | null }
export interface ChangeInput extends MeetingTime { title: string, place: string | null, notes: string | null, tell: boolean }

interface MeetingRow { id: string, title: string, starts_at: number, ends_at: number, place: string | null, notes: string | null, arranged_by: string, find_id: string | null, state: MeetingState, cancelled_reason: string | null, context_ref: string | null }

async function instants(t: MeetingTime): Promise<{ from: number, to: number }> {
  const zone = await theatreTimeZone()
  if (t.end <= t.start || t.end > DAY_MINUTES) refuse('availability.meeting.times', 'A meeting ends after it starts, on the same day.', { status: 422 })
  const from = instantOfLocal(t.date, clockOf(t.start), zone)
  const to = t.end === DAY_MINUTES ? instantOfLocal(addDays(t.date, 1), '00:00', zone) : instantOfLocal(t.date, clockOf(t.end), zone)
  if (from <= nowMs()) refuse('availability.meeting.past', 'A meeting cannot start in the past.', { status: 422 })
  return { from, to }
}

/** The meeting's time in the theatre's words, for notices. */
async function whenOf(from: number, to: number): Promise<string> {
  const zone = await theatreTimeZone()
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const date = localDateOf(from, zone)
  const day = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.parse(`${date}T12:00:00Z`))
  const clock = (ms: number) => clockOf(localParts(ms, zone).hour * 60 + localParts(ms, zone).minute) // not-policy: minutes in an hour
  return `${day}, ${clock(from)} to ${clock(to)}`
}

const inviteeIds = async (id: string, all = false) => (await useDb().all<{ account_id: string }>(
  sql`SELECT account_id FROM availability_meeting_invitees WHERE meeting_id = ${id}${all ? sql`` : sql` AND response <> 'not-going'`}`)).map(r => r.account_id)

async function tell(unit: UnitView, type: string, m: { id: string, arranged_by: string }, variables: Record<string, string>, key: string, to?: string[]) {
  const people = (to ?? await inviteeIds(m.id, true)).filter(a => a !== m.arranged_by)
  await notify(unit, type, { to: people.map(accountId => ({ accountId, variables: { ...variables, meeting: m.id }, dedupeKey: `${key}:${m.id}` })) })
}

/** M1: from a decided poll (its people) or directly (groups the organiser plans for), told once. */
export async function arrange(unit: UnitView, viewer: Actor, input: ArrangeInput): Promise<{ meetingId: string, invited: number }> {
  const { from, to } = await instants(input)
  const id = newId('avmt')
  let ids: string[]
  if (input.findId) {
    const find = await first<{ created_by: string }>('SELECT created_by FROM availability_finds WHERE id = ?', input.findId)
    if (!find || (find.created_by !== viewer.accountId && !(await can(viewer, 'availability.find.anyone')).allowed)) refuse('availability.poll.not-found', 'There is no such poll.', { status: 404 })
    ids = (await useDb().all<{ account_id: string }>(sql`SELECT account_id FROM availability_find_people WHERE find_id = ${input.findId}`)).map(r => r.account_id)
    unit.add(sql`UPDATE availability_finds SET outcome_ref = ${`availability.meeting:${id}`}, updated_at = ${nowMs()} WHERE id = ${input.findId}`)
  }
  else ids = (await peopleOf(viewer, input)).ids
  if (!ids.length) refuse('availability.request.nobody', 'Nobody would be asked.', { status: 422, remedy: 'Choose a group with people in it.' })
  const at = nowMs()
  unit.add(sql`INSERT INTO availability_meetings (id, title, starts_at, ends_at, place, notes, arranged_by, find_id, state, created_at, updated_at)
    VALUES (${id}, ${input.title}, ${from}, ${to}, ${input.place}, ${input.notes}, ${viewer.accountId!}, ${input.findId}, 'arranged', ${at}, ${at})`)
  unit.insertSet(meetingInvitees, ids.map(accountId => ({ meetingId: id, accountId, response: 'pending' as const })))
  unit.announce('availability.meeting.arranged', { meetingId: id, from, to }, { record: ['availability.meeting', id] })
  const organiser = await first<{ name: string | null }>('SELECT name FROM core_accounts WHERE id = ?', viewer.accountId!)
  await tell(unit, 'availability.meeting-invited', { id, arranged_by: viewer.accountId! }, { title: input.title, when: await whenOf(from, to), organiser: organiser?.name ?? '' }, 'meeting-invited', ids)
  return { meetingId: id, invited: ids.filter(a => a !== viewer.accountId).length }
}

async function requireMeeting(id: string): Promise<MeetingRow> {
  return await first<MeetingRow>('SELECT * FROM availability_meetings WHERE id = ?', id) ?? refuse('availability.meeting.not-found', 'There is no such meeting.', { status: 404 })
}

const isOrganiser = async (m: MeetingRow, viewer: Actor) => m.arranged_by === viewer.accountId || (await can(viewer, 'availability.find.anyone')).allowed

async function organised(id: string, actor: Actor): Promise<MeetingRow> {
  const m = await requireMeeting(id)
  if (!await isOrganiser(m, actor)) refuse('availability.meeting.not-yours', 'Only the person who arranged it can do that.', { status: 403 })
  return m
}

/** M3: a new time tells everyone and sets every answer back; other changes tell only when asked to. */
export async function change(unit: UnitView, id: string, actor: Actor, input: ChangeInput): Promise<{ moved: boolean }> {
  const m = await organised(id, actor)
  const { from, to } = await instants(input)
  const moved = from !== m.starts_at || to !== m.ends_at
  const at = nowMs()
  unit.add(sql`UPDATE availability_meetings SET title = ${input.title}, place = ${input.place}, notes = ${input.notes}, starts_at = ${from}, ends_at = ${to}, updated_at = ${at}
    WHERE id = ${id} AND state = 'arranged' AND ends_at > ${at}`)
    .expect(1, { code: 'availability.meeting.over', reason: 'This meeting is cancelled or over.' })
  const variables = { title: input.title, when: await whenOf(from, to) }
  if (moved) {
    unit.add(sql`UPDATE availability_meeting_invitees SET response = 'pending', responded_at = NULL, updated_at = ${at} WHERE meeting_id = ${id}`)
    unit.announce('availability.meeting.moved', { meetingId: id, from, to }, { record: ['availability.meeting', id] })
    await tell(unit, 'availability.meeting-moved', m, variables, `meeting-moved:${from}`)
  }
  else if (input.tell) await tell(unit, 'availability.meeting-changed', m, variables, `meeting-changed:${at}`)
  return { moved }
}

/** M4: cancelled with an optional reason; everyone is told and it leaves person-busy. */
export async function cancel(unit: UnitView, id: string, actor: Actor, reason: string | null): Promise<void> {
  const m = await organised(id, actor)
  const at = nowMs()
  unit.add(sql`UPDATE availability_meetings SET state = 'cancelled', cancelled_reason = ${reason}, updated_at = ${at} WHERE id = ${id} AND state = 'arranged' AND ends_at > ${at}`)
    .expect(1, { code: 'availability.meeting.over', reason: 'This meeting is cancelled or over.' })
  unit.announce('availability.meeting.cancelled', { meetingId: id, from: m.starts_at, to: m.ends_at }, { record: ['availability.meeting', id] })
  await tell(unit, 'availability.meeting-cancelled', m, { title: m.title, when: await whenOf(m.starts_at, m.ends_at) }, 'meeting-cancelled')
}

/** M2: going or not going, changeable until the meeting ends. */
export async function respond(unit: UnitView, id: string, viewer: Actor, response: Exclude<Response, 'pending'>): Promise<void> {
  await requireMeeting(id)
  const at = nowMs()
  unit.add(sql`UPDATE availability_meeting_invitees SET response = ${response}, responded_at = ${at}, updated_at = ${at}
    WHERE meeting_id = ${id} AND ${inAccountScope('account_id', viewer.accountId!)}
    AND EXISTS (SELECT 1 FROM availability_meetings m WHERE m.id = ${id} AND m.state = 'arranged' AND m.ends_at > ${at})`)
    .expect(1, { code: 'availability.meeting.cannot-answer', reason: 'You cannot answer this meeting now.' })
}

export interface MeetingView {
  meeting: { id: string, title: string, from: number, to: number, place: string | null, notes: string | null, state: MeetingState, over: boolean, cancelledReason: string | null, organiser: string, findId: string | null }
  /** The meeting's day and times in the theatre's zone, with today and the grid step, for changing it. */
  local: MeetingTime & { today: string, step: number }
  organiser: boolean
  mine: Response | null
  counts: Record<Response, number>
  invitees?: { accountId: string, name: string, response: Response }[]
}

/** S12: invitees see the meeting, their answer and the counts; the organiser sees everyone's answer. */
export async function meetingView(id: string, viewer: Actor): Promise<MeetingView> {
  const m = await requireMeeting(id)
  const organiser = await isOrganiser(m, viewer)
  const rows = await useDb().all<{ account_id: string, response: Response, name: string | null, me: number }>(sql`SELECT i.account_id, i.response, a.name, ${inAccountScope('i.account_id', viewer.accountId!)} AS me
    FROM availability_meeting_invitees i LEFT JOIN core_accounts a ON a.id = i.account_id WHERE i.meeting_id = ${id} ORDER BY a.name, i.account_id`)
  const mine = rows.find(r => r.me)?.response ?? null
  if (!organiser && !mine) refuse('availability.meeting.not-found', 'There is no such meeting.', { status: 404 })
  const counts = { 'pending': 0, 'going': 0, 'not-going': 0 }
  rows.forEach(r => counts[r.response]++)
  const name = await first<{ name: string | null }>('SELECT name FROM core_accounts WHERE id = ?', m.arranged_by)
  const zone = await theatreTimeZone()
  const minutes = (ms: number) => localParts(ms, zone).hour * 60 + localParts(ms, zone).minute // not-policy: minutes in an hour
  const date = localDateOf(m.starts_at, zone)
  const local = { date, start: minutes(m.starts_at), end: localDateOf(m.ends_at, zone) === date ? minutes(m.ends_at) : DAY_MINUTES, today: localDateOf(nowMs(), zone), step: Number(await useSetting('availability.grid.step')) }
  return {
    local,
    meeting: { id, title: m.title, from: m.starts_at, to: m.ends_at, place: m.place, notes: m.notes, state: m.state, over: m.ends_at <= nowMs(), cancelledReason: m.cancelled_reason, organiser: name?.name ?? '', findId: m.find_id },
    organiser,
    mine,
    counts,
    ...(organiser ? { invitees: rows.map(r => ({ accountId: r.account_id, name: r.name ?? '', response: r.response })) } : {}),
  }
}

export interface MeetingRowOut { id: string, title: string, from: number, to: number, state: MeetingState, response: Response | null, going: number, invited: number }

/** S4: meetings the person is invited to that have not ended. */
export async function myMeetings(accountId: string): Promise<MeetingRowOut[]> {
  const rows = await useDb().all<{ id: string, title: string, starts_at: number, ends_at: number, state: MeetingState, response: Response, going: number, invited: number }>(sql`SELECT m.id, m.title, m.starts_at, m.ends_at, m.state, i.response,
    (SELECT count(*) FROM availability_meeting_invitees x WHERE x.meeting_id = m.id AND x.response = 'going') AS going,
    (SELECT count(*) FROM availability_meeting_invitees x WHERE x.meeting_id = m.id) AS invited
    FROM availability_meeting_invitees i JOIN availability_meetings m ON m.id = i.meeting_id
    WHERE ${inAccountScope('i.account_id', accountId)} AND m.ends_at > ${nowMs()} ORDER BY m.starts_at, m.id`)
  return rows.map(r => ({ id: r.id, title: r.title, from: r.starts_at, to: r.ends_at, state: r.state, response: r.response, going: r.going, invited: r.invited }))
}

/** S7: the viewer's own meetings that have not ended, with how many are going. */
export async function arrangedMeetings(viewer: Actor): Promise<MeetingRowOut[]> {
  const rows = await useDb().all<{ id: string, title: string, starts_at: number, ends_at: number, state: MeetingState, going: number, invited: number }>(sql`SELECT m.id, m.title, m.starts_at, m.ends_at, m.state,
    (SELECT count(*) FROM availability_meeting_invitees x WHERE x.meeting_id = m.id AND x.response = 'going') AS going,
    (SELECT count(*) FROM availability_meeting_invitees x WHERE x.meeting_id = m.id) AS invited
    FROM availability_meetings m WHERE ${inAccountScope('m.arranged_by', viewer.accountId!)} AND m.ends_at > ${nowMs()} ORDER BY m.starts_at, m.id`)
  return rows.map(r => ({ id: r.id, title: r.title, from: r.starts_at, to: r.ends_at, state: r.state, response: null, going: r.going, invited: r.invited }))
}

/** M5: each invitee not saying not going is busy, firm, for an arranged meeting overlapping the window. */
export async function meetingBusy(accountIds: string[], from: number, to: number): Promise<{ accountId: string, from: number, to: number, meetingId: string }[]> {
  const rows = await useDb().all<{ account_id: string, starts_at: number, ends_at: number, id: string }>(sql`SELECT i.account_id, m.starts_at, m.ends_at, m.id
    FROM availability_meeting_invitees i JOIN availability_meetings m ON m.id = i.meeting_id
    WHERE m.state = 'arranged' AND m.starts_at < ${to} AND m.ends_at > ${from} AND i.response <> 'not-going'
    AND i.account_id IN (SELECT value FROM json_each(${JSON.stringify(accountIds)}))`) // exact-account: core asks with the ids it was given
  return rows.map(r => ({ accountId: r.account_id, from: r.starts_at, to: r.ends_at, meetingId: r.id }))
}

/** Retention: meetings ended longer ago than `retention.history` go, with their invitees. */
export async function sweepOldMeetings(unit: UnitView): Promise<void> {
  const keep = (await useSetting('availability.retention.history') as number) * 1000 // not-policy: settings are seconds
  const old = sql`SELECT id FROM availability_meetings WHERE ends_at < ${nowMs() - keep}`
  unit.add(sql`UPDATE availability_finds SET outcome_ref = NULL WHERE outcome_ref IN (SELECT 'availability.meeting:' || id FROM (${old}))`)
  unit.add(sql`DELETE FROM availability_meeting_invitees WHERE meeting_id IN (${old})`)
  unit.add(sql`DELETE FROM availability_meetings WHERE id IN (${old})`)
}
