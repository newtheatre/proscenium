import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageFohReference } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  kind: z.enum(schema.CONTACT_KINDS).optional(),
  note: z.string().trim().max(300).nullable().optional(),
  sort: z.coerce.number().int().min(0).max(999).optional(),
  // Archived rather than deleted: a number that was on the card during an
  // incident should still be findable afterwards (ADR-0010).
  archived: z.boolean().optional(),
})

/** PUT /api/admin/foh/contacts/:id. Edit or archive a contact. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageFohReference)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Contact ID is required' })

  const input = await readValidatedBody(event, bodySchema.parse)
  if (!Object.keys(input).length) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields provided for update' })
  }

  const [row] = await db.update(schema.fohContacts).set(input)
    .where(eq(schema.fohContacts.id, id)).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Contact not found' })

  return row
})
