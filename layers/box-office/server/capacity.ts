// Capacity (Box office specification, part 3, "A claim", and the proof "The last seat on D1"). A
// claim is one unit of a pool. Taking seats is one batch: release what has lapsed in the pools
// asked for, assert each pool still has room for the whole party, then insert every claim. The
// assertion is a conditional write whose refusal says "sold out"; behind it the pool's CHECK, fed by
// triggers, refuses a claim past capacity whatever any code does. A party is seated whole or not at
// all, because it is one batch.
import { all, nowMs, type UnitView } from '#kit'
import { claims } from './db/schema'

export type ReleaseReason = 'expired' | 'abandoned' | 'cancelled' | 'exchanged' | 'staff' | 'payment_failed'

export interface ClaimRequest { poolId: string, quantity: number }

/**
 * Releases the lapsed claims of these pools, lazily, so a missed sweep never blocks a sale. A hold
 * being paid for is left alone: Payments ends it, through the settlement handler's release, once
 * the payment has an answer.
 */
export function releaseLapsed(unit: UnitView, poolIds: string[], at = nowMs()): void {
  unit.add({
    sql: `UPDATE box_office_claims SET state = 'released', released_at = ?1, release_reason = 'expired'
      WHERE pool_id IN (SELECT value FROM json_each(?2)) AND state = 'held' AND expires_at IS NOT NULL AND expires_at <= ?1
        AND hold_id IN (SELECT id FROM box_office_holds WHERE kind <> 'payment')`,
    params: [at, JSON.stringify(poolIds)],
  })
}

/**
 * Adds the statements that take seats under a hold: every claim, or none. Returns the claims' ids,
 * pool by pool in the order asked. `expiresAt` is null for claims confirmed at once.
 */
export async function claimSeats(unit: UnitView, input: { holdId: string, requests: ClaimRequest[], state?: 'held' | 'confirmed', expiresAt: number | null }): Promise<string[][]> {
  const wanted = new Map<string, number>()
  for (const r of input.requests) wanted.set(r.poolId, (wanted.get(r.poolId) ?? 0) + r.quantity)
  const poolIds = [...wanted.keys()]
  const at = nowMs()
  // Only for the words of a refusal: what is free is decided by the statements below.
  const free = new Map((await all<{ id: string, free: number }>(
    `SELECT o.id, o.capacity - o.claimed + (SELECT count(*) FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id
        WHERE c.pool_id = o.id AND c.state = 'held' AND c.expires_at IS NOT NULL AND c.expires_at <= ?1 AND h.kind <> 'payment') AS free
      FROM box_office_pools o WHERE o.id IN (SELECT value FROM json_each(?2))`, at, JSON.stringify(poolIds))).map(r => [r.id, r.free]))

  releaseLapsed(unit, poolIds, at)
  for (const [poolId, quantity] of wanted) {
    const left = free.get(poolId) ?? 0
    unit.add({ sql: 'UPDATE box_office_pools SET updated_at = ? WHERE id = ? AND capacity - claimed >= ?', params: [at, poolId, quantity] })
      // A read that still saw room for the whole party was beaten to it: the seats have just gone.
      .expect(1, left > 0 && left < quantity
        ? { code: 'box-office.capacity.not-enough', reason: `Only ${left} ${left === 1 ? 'is' : 'are'} left, so ${quantity} cannot be taken together.`, remedy: 'Choose fewer, or another part of the house.' }
        : { code: 'box-office.capacity.sold-out', reason: 'These have just gone.', remedy: 'Choose another part of the house or another performance.' })
  }
  const state = input.state ?? 'held'
  const rows = input.requests.flatMap(r => Array.from({ length: r.quantity }, () => ({ poolId: r.poolId, holdId: input.holdId, state, expiresAt: state === 'confirmed' ? null : input.expiresAt })))
  const ids = unit.insertSet(claims, rows)
  unit.expect(rows.length)
  let next = 0
  return input.requests.map(r => ids.slice(next, next += r.quantity))
}

/** Releases every live claim of a hold. Safe to call twice: a released claim is not touched again. */
export function releaseHold(unit: UnitView, holdId: string, reason: ReleaseReason): void {
  unit.add({
    sql: "UPDATE box_office_claims SET state = 'released', released_at = ?, release_reason = ? WHERE hold_id = ? AND state IN ('held', 'confirmed')",
    params: [nowMs(), reason, holdId],
  })
}
