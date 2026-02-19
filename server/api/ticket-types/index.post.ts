import { ticketTypes } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createTicketType } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  price: z.number().int().nonnegative('Price must be a non-negative integer (in pence)'),
  activeByDefault: z.boolean().optional().default(true),
})

export default defineEventHandler(async (event) => {
  await authorize(event, createTicketType)

  const body = await readValidatedBody(event, bodySchema.parse)

  // Check for duplicate name
  const existing = await db.select().from(ticketTypes).where(eq(ticketTypes.name, body.name)).get()
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: 'A ticket type with this name already exists' })
  }

  const [newTicketType] = await db.insert(ticketTypes).values({
    name: body.name,
    description: body.description,
    price: body.price,
    activeByDefault: body.activeByDefault,
  }).returning()

  if (!newTicketType) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create ticket type' })
  }

  return newTicketType
})
