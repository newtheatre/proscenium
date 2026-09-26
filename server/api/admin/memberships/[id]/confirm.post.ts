import { eq, sql } from 'drizzle-orm'

const ALREADY_CONFIRMED = 'That membership is already confirmed'

// Confirm a membership against the SU's record (A-117 criterion 4).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'members.write')
  const id = getRouterParam(event, 'id') ?? ''

  const [held] = await db.select({
    id: schema.memberships.id,
    userId: schema.memberships.userId,
    confirmedAt: schema.memberships.confirmedAt,
    anonymisedAt: schema.users.anonymisedAt,
  })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.id, id))
    .limit(1)
  if (!held) throw noSuch('membership')
  // Nobody can be checked against the SU's list once erased, so it is refused as every other
  // membership write refuses a tombstone (issue #1364).
  if (held.anonymisedAt !== null) throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  if (held.confirmedAt !== null) throw createError({ statusCode: 409, statusMessage: ALREADY_CONFIRMED })

  // Two officers confirming at once write once: the predicate rides the update, and the trail
  // follows only the one that changed a row (0003, 0049).
  const applied = await auditedWrite(
    db.all<{ id: string }>(sql`UPDATE memberships SET confirmed_at = ${Math.floor(Date.now() / 1000)}, confirmed_by = ${resolved.account.id}
      WHERE id = ${id} AND confirmed_at IS NULL RETURNING id`),
    auditEntry({
      actorId: resolved.account.id,
      action: 'membership.confirmed',
      target: `user:${held.userId}`,
      detail: { membership: id },
    }),
  )
  if (!applied) throw createError({ statusCode: 409, statusMessage: ALREADY_CONFIRMED })

  return { ok: true }
})
