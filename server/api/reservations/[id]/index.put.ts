import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updateReservation } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  status: z.enum(['PENDING', 'COLLECTED', 'DOOR', 'CANCELLED', 'NO_SHOW']).optional(),
  cancelledBy: z.enum(['CUSTOMER', 'STAFF']).optional().nullable(),
  customerNotes: z.string().optional().nullable(),
  staffNotes: z.string().optional().nullable(),
}).refine(
  data => !(data.status === 'CANCELLED' && !data.cancelledBy),
  { message: 'cancelledBy is required when status is CANCELLED' },
)

/** PUT /api/reservations/:id — update a reservation. Staff only. */
export default defineEventHandler(async (event) => {
  await authorize(event, updateReservation)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  const existing = await db.select().from(schema.reservations).where(eq(schema.reservations.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })

  const body = await readValidatedBody(event, bodySchema.parse)

  const updateData: Partial<typeof schema.reservations.$inferInsert> = {}
  if (body.status !== undefined) updateData.status = body.status
  if (body.cancelledBy !== undefined) updateData.cancelledBy = body.cancelledBy ?? null
  if (body.customerNotes !== undefined) updateData.customerNotes = body.customerNotes ?? null
  if (body.staffNotes !== undefined) updateData.staffNotes = body.staffNotes ?? null

  // If status is being set away from CANCELLED, clear cancelledBy
  if (body.status && body.status !== 'CANCELLED' && !('cancelledBy' in body)) {
    updateData.cancelledBy = null
  }

  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields provided for update' })
  }

  const [updated] = await db.update(schema.reservations).set(updateData).where(eq(schema.reservations.id, id)).returning()

  return updated
})
