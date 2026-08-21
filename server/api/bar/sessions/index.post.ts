import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  venue: z.string().trim().max(60).nullable().optional(),
  performanceIds: z.array(z.string().trim().min(1)).max(8).optional().default([]),
})

/** POST /api/bar/sessions — open the bar for tonight. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const night = await requireBarScope(user)
  // Every field is optional, so opening the bar with no body at all is valid.
  const input = await readValidatedBody(event, body => bodySchema.parse(body ?? {}))

  const open = await db.select().from(schema.barSessions)
    .where(and(eq(schema.barSessions.night, night), isNull(schema.barSessions.closedAt))).get()
  // Re-opening is a no-op rather than an error: two people tapping Open at
  // 18:30 is normal, and one of them should not see a failure.
  if (open) return open

  const [session] = await db.insert(schema.barSessions).values({
    night,
    venue: input.venue ?? null,
    openedAt: new Date(),
    openedByUserId: user.id,
  }).returning()

  if (input.performanceIds.length) {
    await db.insert(schema.barSessionPerformances)
      .values(input.performanceIds.map(performanceId => ({ sessionId: session!.id, performanceId })))
      .onConflictDoNothing()
  }

  return session
})
