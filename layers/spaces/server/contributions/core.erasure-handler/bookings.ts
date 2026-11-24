// Erasure (part 2): the erased person's future bookings are cancelled and their open requests
// withdrawn, in the erasure's own unit, so their times are free before the registry redacts them.
import { sql } from 'drizzle-orm'
import { inAccountScope, nowMs, useDb, type UnitView } from '#kit'
import { bookingEvents } from '../../db/schema'

export default {
  async erase(unit: UnitView, subject: { accountId?: string }) {
    if (!subject.accountId) return
    const at = nowMs()
    for (const [was, to] of [['confirmed', 'cancelled'], ['requested', 'withdrawn']] as const) {
      const rows = await useDb().all<{ id: string, bookable_id: string }>(
        sql`SELECT id, bookable_id FROM spaces_bookings WHERE state = ${was} AND starts_at > ${at} AND ${inAccountScope('booked_for', subject.accountId)}`)
      if (!rows.length) continue
      const ids = JSON.stringify(rows.map(r => r.id))
      unit.add(sql`UPDATE spaces_bookings SET state = ${to}, closed_reason = 'by-booker', updated_at = ${at}
        WHERE id IN (SELECT value FROM json_each(${ids})) AND state = ${was}`)
      unit.insertSet(bookingEvents, rows.map(r => ({ bookingId: r.id, kind: to, actor: null, at })))
      unit.announce(`spaces.booking.${to}`, rows.map(r => ({
        payload: { bookingId: r.id, bookableId: r.bookable_id, ...(to === 'cancelled' ? { reason: 'by-booker', late: false } : {}) },
        record: ['spaces.booking', r.id] as const,
      })))
    }
  },
}
