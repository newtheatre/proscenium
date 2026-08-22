import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { updateTicketType } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional().nullable(),
  price: z.number().int().nonnegative('Price must be a non-negative integer (in pence)').optional(),
  activeByDefault: z.boolean().optional(),
  /**
   * Retire a type (ADR-0010). Distinct from `activeByDefault`, which only
   * decides whether a live type is pre-selected on new shows.
   */
  archived: z.boolean().optional(),
})

/** PUT /api/ticket-types/:id. Update a ticket type. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  const ticketTypeId = getRouterParam(event, 'id')

  if (!ticketTypeId) {
    throw createError({ statusCode: 400, statusMessage: 'Ticket type ID is required' })
  }

  await authorize(event, updateTicketType)

  const existing = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, ticketTypeId)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Ticket type not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  // Check name uniqueness if being changed
  if (body.name !== undefined && body.name !== existing.name) {
    const conflict = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.name, body.name)).get()
    if (conflict) {
      throw createError({ statusCode: 400, statusMessage: 'A ticket type with this name already exists' })
    }
  }

  const updateData: {
    name?: string
    description?: string | null
    price?: number
    activeByDefault?: boolean
    archived?: boolean
  } = {}

  if (body.name !== undefined) updateData.name = body.name
  if (body.description !== undefined) updateData.description = body.description
  if (body.price !== undefined) updateData.price = body.price
  if (body.activeByDefault !== undefined) updateData.activeByDefault = body.activeByDefault
  if (body.archived !== undefined) updateData.archived = body.archived

  if (Object.keys(updateData).length === 0) {
    return existing
  }

  const [updated] = await db.update(schema.ticketTypes)
    .set(updateData)
    .where(eq(schema.ticketTypes.id, ticketTypeId))
    .returning()

  return updated
})
