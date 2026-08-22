import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { manageShifts } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  /** Null for the default that applies to every venue without its own. */
  venueId: z.string().trim().min(1).nullable(),
  slots: z.array(z.object({
    role: z.enum(schema.SHIFT_ROLES),
    count: z.coerce.number().int().min(0).max(20),
  })).max(schema.SHIFT_ROLES.length),
})

/**
 * PUT /api/shifts/templates: set the slots stamped onto a new performance.
 * Replaces the set for that venue, so a count of 0 removes the role.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, manageShifts)

  const input = await readValidatedBody(event, bodySchema.parse)

  if (input.venueId) {
    const venue = await db.select({ id: schema.venues.id, isExternal: schema.venues.isExternal })
      .from(schema.venues).where(eq(schema.venues.id, input.venueId)).get()
    if (!venue) throw createError({ statusCode: 404, statusMessage: 'No such venue.' })
    if (venue.isExternal) {
      throw createError({ statusCode: 400, statusMessage: 'That venue is not ours, so it has no rota.' })
    }
  }

  const scope = input.venueId
    ? eq(schema.shiftTemplates.venueId, input.venueId)
    : isNull(schema.shiftTemplates.venueId)

  const statements: BatchItem<'sqlite'>[] = [
    db.delete(schema.shiftTemplates).where(scope),
    // One statement per role: four rows, so this cannot approach D1's limit.
    ...input.slots.filter(slot => slot.count > 0).map(slot =>
      db.insert(schema.shiftTemplates).values({
        venueId: input.venueId,
        role: slot.role,
        count: slot.count,
      }) as BatchItem<'sqlite'>),
  ]

  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  return { venueId: input.venueId, slots: input.slots.filter(s => s.count > 0).length }
})
