import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { cancelPass } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  status: z.enum(['ACTIVE', 'CANCELLED', 'EXPIRED']).optional(),
  notes: z.string().optional().nullable(),
})

/**
 * PUT /api/passes/:id — update an issued pass. Admin/Manager only.
 *
 * Cancelling leaves any admissions already redeemed in place: those were real
 * attendances and the tickets they created are part of the door record. It only
 * stops the pass being used again.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, cancelPass)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Pass ID is required' })

  const body = await readValidatedBody(event, bodySchema.parse)

  const pass = await db.select({ id: schema.passes.id, status: schema.passes.status })
    .from(schema.passes).where(eq(schema.passes.id, id)).get()
  if (!pass) throw createError({ statusCode: 404, statusMessage: 'Pass not found' })

  const update: Partial<typeof schema.passes.$inferInsert> = {}
  if (body.notes !== undefined) update.notes = body.notes ?? null

  if (body.status && body.status !== pass.status) {
    update.status = body.status
    if (body.status === 'CANCELLED') {
      update.cancelledAt = new Date().toISOString()
      update.cancelledBy = 'STAFF'
    }
    else {
      update.cancelledAt = null
      update.cancelledBy = null
    }
  }

  if (Object.keys(update).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No changes supplied' })
  }

  const [updated] = await db.update(schema.passes)
    .set(update)
    .where(eq(schema.passes.id, id))
    .returning({
      id: schema.passes.id,
      reference: schema.passes.reference,
      status: schema.passes.status,
    })

  return updated
})
