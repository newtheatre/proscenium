// The checks on performance writes (part 3): the space guard, why a time is refused, and the change
// impact and guards other modules contribute. Statement predicates decide; the reads choose the words.
import { sql, type SQL } from 'drizzle-orm'
import { first, refuse, useDb, usePoint, useSetting } from '#kit'
import type { Actor } from '#kit'
import { assertNoBlockingClosure, closuresBetween } from '../places/closures'
import { operatingDayOf } from '../calendar'
import type { ChangeImpact, ProposedChange } from '../points/change-impact'
import type { ChangeGuard, GuardAnswer } from '../points/change-guard'
import type { SpaceBusy } from '../points/space-busy'

/** The turnaround between performances in one space, in milliseconds (core.programme.turnaround). */
export async function turnaroundMs(): Promise<number> {
  return (await useSetting('core.programme.turnaround') as number) * 1000 // not-policy: seconds to milliseconds
}

// ---------------------------------------------------------------------------------------------
// The space guard

/**
 * No other scheduled performance overlaps [from, to) in this space, if the space is exclusive.
 * `except` leaves out the performance being moved. `gap` is the turnaround in milliseconds: another
 * performance must end at least that long before this starts, and start that long after it ends. A
 * statement predicate.
 */
export function noClash(spaceId: string | SQL, from: number | SQL, to: number | SQL, options: { except?: string | null, gap?: number } = {}): SQL {
  const { except = null, gap = 0 } = options
  return sql`((SELECT exclusive FROM core_spaces WHERE id = ${spaceId}) = 0 OR NOT EXISTS (SELECT 1 FROM core_performances o
    WHERE o.space_id = ${spaceId} AND o.state = 'scheduled' AND o.starts_at < ${to} + ${gap} AND o.ends_at + ${gap} > ${from} AND o.id IS NOT ${except}))`
}

/**
 * A predicate a caller puts on its own write: no scheduled performance in this space overlaps
 * [from, to), and no blocking closure of the space, its venue or the whole theatre does. Like
 * assertTerm, it goes on the statement, never in a read made beforehand.
 */
export function assertSpaceFree(spaceId: string | SQL, from: number | SQL, to: number | SQL, gap = 0): SQL {
  return sql`(${noClash(spaceId, from, to, { gap })} AND ${assertNoBlockingClosure(spaceId, from, to)})`
}

/**
 * The same test as a read, for showing and for a module checking just before its own write: no
 * performance or blocking closure, and nothing another module reports to core.space-busy. `except`
 * leaves out one module's own times (Spaces asking about its bookings' room). Never for deciding a
 * core write: use assertSpaceFree.
 */
export async function isSpaceFree(spaceId: string, from: number, to: number, options: { except?: string } = {}): Promise<boolean> {
  if (!(await useDb().get<{ free: number }>(sql`SELECT ${assertSpaceFree(spaceId, from, to, await turnaroundMs())} AS free`))?.free) return false
  for (const { module, value } of await usePoint<SpaceBusy>('core.space-busy')) {
    if (module === options.except) continue
    const items = await value.busy({ spaceIds: [spaceId], from, to }, null)
    if (items.some(i => i.spaceId === spaceId && i.from < to && i.to > from)) return false
  }
  return true
}

/** The space belongs to the venue, can hold performances and is not archived. */
export const spaceFits = (venueId: string, spaceId: string): SQL =>
  sql`EXISTS (SELECT 1 FROM core_spaces WHERE id = ${spaceId} AND venue_id = ${venueId} AND performable = 1 AND state = 'active')`

/**
 * Why [from, to) cannot be scheduled in this space, in the words the person sees, or null. A read:
 * it chooses the refusal, and the statement's predicate decides.
 */
export async function whyNotFree(spaceId: string, from: number, to: number, except: string | null): Promise<{ code: string, reason: string } | null> {
  const space = await first<{ exclusive: number }>('SELECT exclusive FROM core_spaces WHERE id = ?', spaceId)
  if (space?.exclusive) {
    const gap = await turnaroundMs()
    const clash = await first<{ title: string, starts_at: number }>(`SELECT p.title, o.starts_at FROM core_performances o JOIN core_productions p ON p.id = o.production_id
      WHERE o.space_id = ? AND o.state = 'scheduled' AND o.starts_at < ? AND o.ends_at > ? AND o.id IS NOT ? ORDER BY o.starts_at LIMIT 1`, spaceId, to + gap, from - gap, except)
    if (clash) return { code: 'core.performance.clash', reason: gap ? `${clash.title} is scheduled in this space at that time, or too close to it for the turnaround.` : `${clash.title} is already scheduled in this space at that time.` }
  }
  const closure = (await closuresBetween(from, to, { spaceId })).find(c => c.blocksPerformances)
  if (closure) return { code: 'core.performance.closed', reason: `The space is closed then: ${closure.title}.` }
  return null
}

/** Public holidays and other closures that do not block, for a warning the person can accept. */
export async function warningsFor(spaceId: string, from: number, to: number): Promise<string[]> {
  return (await closuresBetween(from, to, { spaceId })).filter(c => !c.blocksPerformances).map(c => c.title)
}

/** Every module's lines for a proposed change, for the confirmation. */
export async function changeImpact(change: ProposedChange, actor: Actor): Promise<string[]> {
  const lines: string[] = []
  for (const c of await usePoint<ChangeImpact>('core.change-impact')) lines.push(...await c.value.impact(change, actor))
  return lines
}

/** The first module that refuses the change, or null. */
export async function firstRefusal(change: ProposedChange, actor: Actor): Promise<(GuardAnswer & { allowed: false }) | null> {
  for (const c of await usePoint<ChangeGuard>('core.change-guard')) {
    const answer = await c.value.check(change, actor)
    if (!answer.allowed) return answer
  }
  return null
}

export async function runGuards(change: ProposedChange, actor: Actor): Promise<void> {
  const refusal = await firstRefusal(change, actor)
  if (refusal) refuse(refusal.code, refusal.reason, { status: 409, ...(refusal.link ? { remedy: refusal.link } : {}) })
}

export function checkTimes(startsAt: number, endsAt: number, doorsAt: number | null) {
  if (endsAt <= startsAt) refuse('core.performance.times', 'A performance must end after it starts.', { status: 422, fields: { endsAt: 'The end must be after the start.' } })
  if (doorsAt !== null && doorsAt > startsAt) refuse('core.performance.doors', 'Doors must open at or before the start.', { status: 422, fields: { doorsAt: 'Doors must open at or before the start.' } })
}

/** DI2: a drop-in opens and closes within one operating day; the caller has already cleared its doors and intervals. */
export async function checkDropIn(startsAt: number, endsAt: number): Promise<void> {
  if (await operatingDayOf(startsAt) !== await operatingDayOf(endsAt - 1))
    refuse('core.performance.drop-in-one-day', 'A drop-in opens and closes on the same day.', { status: 422, fields: { endsAt: 'Close it the same day, or make one drop-in for each day.' } })
}
