import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { manageFohReference } from '~~/shared/utils/abilities'

const text = z.string().trim().max(2000).nullable().optional()
const bodySchema = z.object({
  addressForEmergencyCall: text,
  what3words: z.string().trim().max(120).nullable().optional(),
  evacuationProcedure: text,
  assemblyPoint: text,
  firstAidLocation: text,
  defibrillatorLocation: text,
  isolationPoints: text,
  firePanelLocation: text,
})

/** PUT /api/admin/foh/emergency/:venueId. Upsert one venue's card. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageFohReference)

  const venueId = getRouterParam(event, 'venueId')
  if (!venueId) throw createError({ statusCode: 400, statusMessage: 'Venue ID is required' })

  const input = await readValidatedBody(event, bodySchema.parse)
  const { user } = await requireUserSession(event)

  const venue = await db.select({ id: schema.venues.id }).from(schema.venues)
    .where(eq(schema.venues.id, venueId)).get()
  if (!venue) throw createError({ statusCode: 404, statusMessage: 'Venue not found' })

  const [row] = await db.insert(schema.venueEmergencyInfo)
    .values({ venueId, ...input, updatedByUserId: user.id })
    .onConflictDoUpdate({
      target: schema.venueEmergencyInfo.venueId,
      set: { ...input, updatedByUserId: user.id },
    })
    .returning()

  return row
})
