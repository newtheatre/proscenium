// The headline numbers Box office gives front of house for one performance, on the Tonight hub
// (core.tonight-figure) and the front of house board (front-of-house.tonight-figure).
import { first } from '#kit'
import { doorSummary } from './door'

export interface TonightNumbers { sold: number, unpaid: number, admitted: number, toCome: number, left: number }

/** Sold counts reservations not yet paid for, as the door does; seats left are what can still be sold. */
export async function tonightNumbers(performanceId: string): Promise<TonightNumbers> {
  const door = await doorSummary(performanceId)
  const seats = await first<{ left: number | null }>(
    'SELECT sum(max(capacity - claimed, 0)) AS left FROM box_office_pools WHERE performance_id = ?', performanceId) // not-policy: none below nothing
  const sold = door.tickets + door.unpaid
  return { sold, unpaid: door.unpaid, admitted: door.admitted, toCome: Math.max(sold - door.admitted, 0), left: Number(seats?.left ?? 0) }
}
