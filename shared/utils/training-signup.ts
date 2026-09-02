import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { fromLondonWallClock } from './london'
import { SESSION_CAPACITY_MAX, SESSION_CAPACITY_MIN } from './training'
import type { PrerequisiteGap } from './training'
import type { SQL } from 'drizzle-orm'

// A place on a session is derived from sign-up order against capacity, never stored: reading a
// count and then writing a status hands the last place to two people at once (0006, G-105).

export const SIGNUP_STATUSES = ['SIGNED_UP', 'CANCELLED', 'ATTENDED', 'ABSENT'] as const
export type SignUpStatus = (typeof SIGNUP_STATUSES)[number]

export const SIGNUP_SOURCES = ['SIGNUP', 'WALK_IN'] as const
export type SignUpSource = (typeof SIGNUP_SOURCES)[number]

export interface SignUpOrder {
  id: string
  userId: string
  signedUpAt: number
  // The row's `rowid`, which is insertion order. Four people can sign up inside one second and
  // the last place still has to go to whoever asked first.
  seq: number
}

export interface Place extends SignUpOrder {
  // One-based across everybody signed up, placed and waiting alike.
  position: number
  placed: boolean
  // One-based among those waiting, or null for somebody holding a place.
  waitlistPosition: number | null
}

// The instant, then the order the rows were written in. A re-join is put behind everybody by the
// statement that writes it, so insertion order never contradicts going to the back.
export function bySignUpOrder(a: SignUpOrder, b: SignUpOrder): number {
  return a.signedUpAt - b.signedUpAt || a.seq - b.seq
}

// The whole derivation, in one place. Capacity is the only input beyond the order, so a capacity
// that moved is answered by asking again rather than by rewriting anything.
export function placesFrom(order: SignUpOrder[], capacity: number): Place[] {
  return [...order].sort(bySignUpOrder).map((row, index) => ({
    ...row,
    position: index + 1,
    placed: index < capacity,
    waitlistPosition: index < capacity ? null : index + 1 - capacity,
  }))
}

// Who moved into a place between two readings of the order. Two processes racing may each name
// the same person; the claim is what decides which of them sends (G-106 criteria 2 and 3).
export function promotedBy(before: Place[], after: Place[]): Place[] {
  const held = new Set(before.filter(place => place.placed).map(place => place.userId))
  return after.filter(place => place.placed && !held.has(place.userId))
}

// One claim per sign-up rather than per person: withdrawing and re-joining is a new sign-up, so
// a later promotion of the same member is a different claim and still sends (G-106 criterion 2).
export function promotionClaimFor(sessionId: string, userId: string, signedUpAt: number): string {
  return `training.session.promoted:${sessionId}:${userId}:${signedUpAt}`
}

// Capacity is the only input to a place besides the order, so moving it is the other thing that
// promotes somebody. Lowering it takes nobody off the list: they fall back to waiting (G-106 c1).
export const sessionCapacityForm = z.object({
  capacity: z.number().int().min(SESSION_CAPACITY_MIN).max(SESSION_CAPACITY_MAX),
})

export type SessionCapacityInput = z.output<typeof sessionCapacityForm>

// Every statement below binds a fixed handful of parameters whatever the session holds, and each
// write carries its own predicate rather than trusting a read taken beforehand (0003, 0006).

// Sign-up never refuses for fullness, so there is no capacity predicate here and never may be
// (criterion 1). The unique pair is what refuses a second live row.
export function signUpStatement(id: string, sessionId: string, userId: string, at: number): SQL {
  return sql`
    insert into session_attendees (id, session_id, user_id, status, source, signed_up_at, created_at)
    values (${id}, ${sessionId}, ${userId}, 'SIGNED_UP', 'SIGNUP', ${at}, ${at})
    on conflict (session_id, user_id) do nothing
    returning id
  `
}

// Re-joining moves the instant and keeps the row, which is what puts somebody at the back. Past
// the last instant on the session, not merely to now: a whole second holds several sign-ups.
export function rejoinStatement(sessionId: string, userId: string, at: number): SQL {
  return sql`
    update session_attendees
    set status = 'SIGNED_UP',
      signed_up_at = max(${at}, coalesce((
        select max(signed_up_at) from session_attendees a
        where a.session_id = ${sessionId} and a.status <> 'CANCELLED'
      ), 0) + 1)
    where session_id = ${sessionId} and user_id = ${userId} and status = 'CANCELLED'
    returning id
  `
}

// Only a live sign-up withdraws: a mark is the register's to change, not the member's (G-116).
export function withdrawStatement(sessionId: string, userId: string): SQL {
  return sql`
    update session_attendees set status = 'CANCELLED'
    where session_id = ${sessionId} and user_id = ${userId} and status = 'SIGNED_UP'
    returning id, signed_up_at as signedUpAt
  `
}

// The order, which is the only thing a place is derived from. Sorted the way bySignUpOrder sorts.
export function signUpOrderStatement(sessionId: string): SQL {
  return sql`
    select id, user_id as userId, signed_up_at as signedUpAt, rowid as seq
    from session_attendees
    where session_id = ${sessionId} and status <> 'CANCELLED'
    order by signed_up_at, rowid
  `
}

// The FULL badge, recomputed from the count in the same statement that writes it. It is a cached
// label nothing authoritative reads, and this is what heals a stale one (G-105, docs/data-model).
export function refreshBadgeStatement(sessionId: string): SQL {
  return sql`
    update training_sessions
    set status = case when (
          select count(*) from session_attendees
          where session_id = training_sessions.id and status <> 'CANCELLED'
        ) >= training_sessions.capacity then 'FULL' else 'OPEN' end,
      updated_at = unixepoch()
    where id = ${sessionId} and status in ('OPEN', 'FULL')
  `
}

export type ClosureReason = 'NOT_OPEN_YET' | 'REGISTER_OPEN' | 'CLOSE_TIME' | 'SESSION_DAY' | 'OFF'

export interface SignUpWindow {
  heldOn: string
  startsAt: string
  opensAt: number | null
  status: string
  // G-115's, and the one line that changes when the register lands.
  registerOpen: boolean
}

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

// Midnight London on the session's day: the moment the session date arrives (0014).
export function sessionDayStarts(heldOn: string): Date {
  const match = CIVIL_DATE.exec(heldOn)
  if (!match) throw new TypeError('a session date is a London civil date, written YYYY-MM-DD')
  return fromLondonWallClock(Number(match[1]), Number(match[2]), Number(match[3]))
}

// The configured close, counted back from the wall clock the session starts at.
export function configuredCloseAt(window: SignUpWindow, closesHours: number): Date {
  const match = CIVIL_DATE.exec(window.heldOn)
  if (!match) throw new TypeError('a session date is a London civil date, written YYYY-MM-DD')
  const [hour, minute] = window.startsAt.split(':').map(Number)
  const starts = fromLondonWallClock(Number(match[1]), Number(match[2]), Number(match[3]), hour, minute)
  return new Date(starts.getTime() - (closesHours * 3_600_000))
}

// Why sign-up is shut, or null while it is open. Whichever closes first wins, so a session day
// that has arrived shuts it however generous the configured close is (G-105 criterion 5).
export function signUpClosure(window: SignUpWindow, closesHours: number, at: Date): ClosureReason | null {
  if (window.status === 'CANCELLED' || window.status === 'DELIVERED') return 'OFF'
  if (window.opensAt !== null && window.opensAt * 1000 > at.getTime()) return 'NOT_OPEN_YET'
  if (window.registerOpen) return 'REGISTER_OPEN'
  if (at.getTime() >= sessionDayStarts(window.heldOn).getTime()) return 'SESSION_DAY'
  if (at.getTime() >= configuredCloseAt(window, closesHours).getTime()) return 'CLOSE_TIME'
  return null
}

// Says the consequence rather than the rule, and every one of them names the way out.
export function saysClosure(reason: ClosureReason): string {
  if (reason === 'NOT_OPEN_YET') return 'Sign-up for this one has not opened yet. It will appear here when it does.'
  if (reason === 'REGISTER_OPEN') return 'The register is open, so sign-up has closed. Speak to the trainer on the night.'
  if (reason === 'SESSION_DAY') return 'Sign-up closed when the day arrived. Speak to the trainer on the night.'
  if (reason === 'CLOSE_TIME') return 'Sign-up has closed so the trainer knows their numbers. Speak to them on the night.'
  return 'This session is no longer taking sign-ups.'
}

// Which gaps are fatal is `prerequisiteGaps` and nothing else: these only sort what it decided,
// because two definitions of that asymmetry is two chances to get safety wrong (G-118 c3).
export function blockingGaps(gaps: readonly PrerequisiteGap[]): PrerequisiteGap[] {
  return gaps.filter(gap => gap.severity === 'BLOCKS')
}

export function warningGaps(gaps: readonly PrerequisiteGap[]): PrerequisiteGap[] {
  return gaps.filter(gap => gap.severity === 'ACKNOWLEDGE')
}

// The one figure a member wants back: where they stand right now, said plainly.
export function saysPlace(place: Pick<Place, 'placed' | 'waitlistPosition'>): string {
  if (place.placed) return 'You have a place'
  return `You are ${place.waitlistPosition} on the waiting list`
}
