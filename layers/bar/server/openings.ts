// Openings (tab 3, "An opening"): an outlet trades from its first sale until it is closed. Closing
// voids the sales still open or parked, and is refused while one is waiting for its payment, because
// that payment may still succeed.
import { all, newId, nowMs, refuse, type UnitView } from '#kit'
import { operatingDayOf } from '#modules/core'

/** Starts the outlet's opening in the batch, unless one is already trading: an outlet opens with its first sale or refusal. */
export async function ensureOpening(unit: UnitView, outletId: string, by: string | null, at: number): Promise<void> {
  unit.add({
    sql: `INSERT INTO bar_openings (id, outlet_id, performance_id, operating_day, state, opened_by, opened_at, created_at, updated_at)
          SELECT ?, ?, NULL, ?, 'open', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM bar_openings WHERE outlet_id = ? AND state = 'open')`,
    params: [newId('bopn'), outletId, await operatingDayOf(at), by, at, at, at, outletId],
  })
}

export interface OpeningRow { id: string, outletId: string, outlet: string, operatingDay: string, state: 'open' | 'closed', openedAt: number, closedAt: number | null, paidMinor: number, sales: number, waiting: number, unpaid: number }

/** Openings, newest first: those still trading, then the last fortnight's closed ones. */
export async function listOpenings(limit = 50): Promise<OpeningRow[]> { // not-policy: a screen's page of openings
  return await all<OpeningRow>(
    `SELECT o.id, o.outlet_id AS outletId, t.name AS outlet, o.operating_day AS operatingDay, o.state, o.opened_at AS openedAt, o.closed_at AS closedAt,
            coalesce((SELECT sum(total_minor) FROM bar_sales WHERE opening_id = o.id AND state = 'paid'), 0) AS paidMinor,
            (SELECT count(*) FROM bar_sales WHERE opening_id = o.id AND state = 'paid') AS sales,
            (SELECT count(*) FROM bar_sales WHERE opening_id = o.id AND state = 'awaiting_payment') AS waiting,
            (SELECT count(*) FROM bar_sales WHERE opening_id = o.id AND state = 'open') AS unpaid
       FROM bar_openings o JOIN bar_outlets t ON t.id = o.outlet_id
      ORDER BY o.state = 'open' DESC, o.opened_at DESC, o.id LIMIT ?`,
    limit,
  )
}

const WAITING = { code: 'bar.opening.payment-waiting', reason: 'A bar sale here is waiting for its payment, which may still succeed.', remedy: 'Finish or cancel that payment in the till, then close.' }

/** Closes an opening: its open sales are voided, in one batch, unless one is waiting for its payment. */
export function closeOpening(unit: UnitView, openingId: string, by: string | null): void {
  const at = nowMs()
  unit.add({
    sql: `UPDATE bar_openings SET state = 'closed', closed_by = ?, closed_at = ?, updated_at = ?
          WHERE id = ? AND state = 'open' AND NOT EXISTS (SELECT 1 FROM bar_sales WHERE opening_id = ? AND state = 'awaiting_payment')`,
    params: [by, at, at, openingId, openingId],
  }).expect(1, WAITING)
  unit.add({ sql: "UPDATE bar_sales SET state = 'void', voided_at = ?, updated_at = ? WHERE opening_id = ? AND state = 'open'", params: [at, at, openingId] })
  unit.audit({ action: 'state', record: ['bar.opening', openingId], detail: { to: 'closed' } })
}

export function refuseUnknown(): never {
  return refuse('core.not-found', 'There is no such opening.', { status: 404 })
}
