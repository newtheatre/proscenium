import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { manageFohReference } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  label: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(3).max(40),
  kind: z.enum(schema.CONTACT_KINDS).optional().default('OTHER'),
  note: z.string().trim().max(300).nullable().optional(),
  sort: z.coerce.number().int().min(0).max(999).optional().default(0),
})

/** POST /api/admin/foh/contacts: add a number the door may need. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageFohReference)

  const input = await readValidatedBody(event, bodySchema.parse)
  const [row] = await db.insert(schema.fohContacts).values(input).returning()
  return row
})
