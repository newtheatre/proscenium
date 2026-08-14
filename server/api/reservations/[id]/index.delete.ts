import { db, schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'
import { deleteReservation } from '~~/shared/utils/abilities'

/** DELETE /api/reservations/:id — delete a reservation. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  await authorize(event, deleteReservation)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  const existing = await db.select().from(schema.reservations).where(eq(schema.reservations.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })

  // A pass was admitted into this reservation. `pass_admissions.ticket_id`
  // cascades, so deleting it would take the redemption ledger row — and the
  // UNIQUE (pass_id, performance_id) that stops a pass being used twice — with
  // it. Cancel the reservation instead (ADR-0010).
  const [admissions] = await db
    .select({ n: count() })
    .from(schema.passAdmissions)
    .innerJoin(schema.tickets, eq(schema.passAdmissions.ticketId, schema.tickets.id))
    .where(eq(schema.tickets.reservationId, id))

  if (admissions?.n) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A pass was admitted into this reservation, and deleting it would erase that record. Cancel the reservation instead.',
    })
  }

  // Delete tickets first (onDelete: 'restrict' on the reservation FK prevents
  // deleting the parent first), atomically, so a failure can't leave a
  // reservation stripped of its tickets or vice versa.
  await db.batch([
    db.delete(schema.tickets).where(eq(schema.tickets.reservationId, id)),
    db.delete(schema.reservations).where(eq(schema.reservations.id, id)),
  ])

  return { message: 'Reservation deleted successfully' }
})
