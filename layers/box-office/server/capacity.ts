// Capacity (Box office specification, part 3, "A claim", and the proof "The last seat on D1"). A
// claim is one unit of a pool. Taking seats is one batch: release what has lapsed in the pools
// asked for, assert each pool still has room for the whole party, then insert every claim. The
// assertion is a conditional write whose refusal says "sold out"; behind it the pool's CHECK, fed by
// triggers, refuses a claim past capacity whatever any code does. A party is seated whole or not at
// all, because it is one batch.
import { all, nowMs, type UnitView } from '#kit'
import { claims } from './db/schema'
import { displacementsFor } from './layouts'

export type ReleaseReason = 'expired' | 'abandoned' | 'cancelled' | 'exchanged' | 'staff' | 'payment_failed'

export interface ClaimRequest { poolId: string, quantity: number }

/**
 * Releases the lapsed claims of these pools, lazily, so a missed sweep never blocks a sale. A hold
 * being paid for is left alone: Payments ends it, through the settlement handler's release, once
 * the payment has an answer. A lapsed wheelchair space and the seats it takes go together, whichever
 * pool is asked for.
 */
export function releaseLapsed(unit: UnitView, poolIds: string[], at = nowMs()): void {
  unit.add({
    sql: `UPDATE box_office_claims SET state = 'released', released_at = ?1, release_reason = 'expired'
      WHERE state = 'held' AND expires_at IS NOT NULL AND expires_at <= ?1 AND hold_id IN (SELECT id FROM box_office_holds WHERE kind <> 'payment')
        AND (pool_id IN (SELECT value FROM json_each(?2))
          OR id IN (SELECT d.displaced_for_id FROM box_office_claims d WHERE d.displaced_for_id IS NOT NULL AND d.pool_id IN (SELECT value FROM json_each(?2))))`,
    params: [at, JSON.stringify(poolIds)],
  })
}

const SPACE_GONE = { code: 'box-office.capacity.wheelchair-gone', reason: 'There is no longer room for a wheelchair space at this performance.', remedy: 'Choose another performance, or ask the box office.' }

/**
 * Adds the statements that take seats under a hold: every claim, or none. Returns the claims' ids,
 * pool by pool in the order asked. `expiresAt` is null for claims confirmed at once.
 *
 * A claim in a wheelchair pool whose space takes seats (layouts.ts) also takes that many seats in
 * the seating pool, as claims that name it, in the same batch: if the seats are not there, nothing
 * is taken. Until the layout's keep-back time, ordinary tickets may not take the seats kept for the
 * spaces still unsold.
 */
export async function claimSeats(unit: UnitView, input: { holdId: string, requests: ClaimRequest[], state?: 'held' | 'confirmed', expiresAt: number | null }): Promise<string[][]> {
  const ordinary = new Map<string, number>()
  for (const r of input.requests) ordinary.set(r.poolId, (ordinary.get(r.poolId) ?? 0) + r.quantity)
  const plans = (await displacementsFor([...ordinary.keys()])).filter(d => d.units > 0 && d.seatPoolId)
  const wanted = new Map(ordinary)
  const spaces = new Map<string, number>()
  for (const d of plans) {
    const s = ordinary.get(d.wheelchairPoolId) ?? 0
    if (!s) continue
    wanted.set(d.seatPoolId!, (wanted.get(d.seatPoolId!) ?? 0) + s * d.units)
    spaces.set(d.seatPoolId!, (spaces.get(d.seatPoolId!) ?? 0) + s)
  }
  const poolIds = [...new Set([...wanted.keys(), ...plans.map(d => d.wheelchairPoolId)])]
  const at = nowMs()
  // Only for the words of a refusal: what is free is decided by the statements below.
  const free = new Map((await all<{ id: string, free: number }>(
    `SELECT o.id, o.capacity - o.claimed + (SELECT count(*) FROM box_office_claims c JOIN box_office_holds h ON h.id = c.hold_id
        WHERE c.pool_id = o.id AND c.state = 'held' AND c.expires_at IS NOT NULL AND c.expires_at <= ?1 AND h.kind <> 'payment') AS free
      FROM box_office_pools o WHERE o.id IN (SELECT value FROM json_each(?2))`, at, JSON.stringify(poolIds))).map(r => [r.id, r.free]))

  releaseLapsed(unit, poolIds, at)
  for (const [poolId, quantity] of wanted) {
    const left = free.get(poolId) ?? 0
    // Seats kept for unbooked wheelchair spaces: ordinary tickets in this pool must leave them free.
    const keeping = plans.find(d => d.seatPoolId === poolId && d.keepUntil !== null && at < d.keepUntil)
    const own = ordinary.get(poolId) ?? 0
    const kept = keeping ? Math.max(0, (free.get(keeping.wheelchairPoolId) ?? 0) * keeping.units) : 0
    const refusal = spaces.get(poolId) && left < quantity
      ? SPACE_GONE
      : keeping && own > 0 && left - kept < own && left >= quantity
        ? { code: 'box-office.capacity.kept-for-wheelchair', reason: left - kept > 0 ? `Only ${left - kept} ${left - kept === 1 ? 'is' : 'are'} left: the other seats are kept for wheelchair spaces for now.` : 'The seats left are kept for wheelchair spaces for now.', remedy: 'Choose fewer, another part of the house or another performance, or ask the box office.' }
        // A read that still saw room for the whole party was beaten to it: the seats have just gone.
        : left > 0 && left < quantity
          ? { code: 'box-office.capacity.not-enough', reason: `Only ${left} ${left === 1 ? 'is' : 'are'} left, so ${quantity} cannot be taken together.`, remedy: 'Choose fewer, or another part of the house.' }
          : { code: 'box-office.capacity.sold-out', reason: 'These have just gone.', remedy: 'Choose another part of the house or another performance.' }
    if (keeping && own > 0) {
      unit.add({
        sql: `UPDATE box_office_pools SET updated_at = ? WHERE id = ? AND capacity - claimed >= ?
          AND capacity - claimed - ? >= coalesce((SELECT w.capacity - w.claimed FROM box_office_pools w WHERE w.id = ?), 0) * ?`,
        params: [at, poolId, quantity, own, keeping.wheelchairPoolId, keeping.units],
      }).expect(1, refusal)
    }
    else {
      unit.add({ sql: 'UPDATE box_office_pools SET updated_at = ? WHERE id = ? AND capacity - claimed >= ?', params: [at, poolId, quantity] }).expect(1, refusal)
    }
  }
  const state = input.state ?? 'held'
  const expiresAt = state === 'confirmed' ? null : input.expiresAt
  const rows = input.requests.flatMap(r => Array.from({ length: r.quantity }, () => ({ poolId: r.poolId, holdId: input.holdId, state, expiresAt })))
  const ids = unit.insertSet(claims, rows)
  unit.expect(rows.length)
  // The seats each space takes the place of: claims that name it, carry no ticket and follow it.
  const displaced = rows.flatMap((row, i) => {
    const plan = plans.find(d => d.wheelchairPoolId === row.poolId)
    return plan ? Array.from({ length: plan.units }, () => ({ ...row, poolId: plan.seatPoolId!, displacedForId: ids[i]! })) : []
  })
  if (displaced.length) {
    unit.insertSet(claims, displaced)
    unit.expect(displaced.length)
  }
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
