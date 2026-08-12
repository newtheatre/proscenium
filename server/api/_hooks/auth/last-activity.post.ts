import { db, schema } from '@nuxthub/db'
import { inArray, max } from 'drizzle-orm'
import { z } from 'zod/v4'

const bodySchema = z.object({ userIds: z.array(z.string().min(1)).max(500) })

/**
 * POST /api/_hooks/auth/last-activity — feeds the retention sweep
 * (stage-door docs/gdpr-retention.md): epoch ms of the user's most recent
 * reservation or pass, null where none is known.
 */
export default defineEventHandler(async (event) => {
  requireHookAuth(event)
  const { userIds } = await readValidatedBody(event, bodySchema.parse)

  const latestReservations = await db.select({
    userId: schema.reservations.userId,
    latest: max(schema.reservations.createdAt),
  }).from(schema.reservations)
    .where(inArray(schema.reservations.userId, userIds))
    .groupBy(schema.reservations.userId)

  const latestPasses = await db.select({
    userId: schema.passes.userId,
    latest: max(schema.passes.createdAt),
  }).from(schema.passes)
    .where(inArray(schema.passes.userId, userIds))
    .groupBy(schema.passes.userId)

  const byUser = new Map<string, number>()
  for (const row of [...latestReservations, ...latestPasses]) {
    if (!row.latest) continue
    // created_at is SQLite text (mixed formats survive the legacy import).
    const iso = row.latest.includes('T') ? row.latest : `${row.latest.replace(' ', 'T')}Z`
    const ms = new Date(iso).getTime()
    if (!Number.isNaN(ms)) byUser.set(row.userId, Math.max(byUser.get(row.userId) ?? 0, ms))
  }

  return Object.fromEntries(userIds.map(id => [id, byUser.get(id) ?? null]))
})
