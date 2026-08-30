import { eq } from 'drizzle-orm'

// Confirm a membership against the SU's record (A-117 criterion 4).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'members.write')
  const id = getRouterParam(event, 'id') ?? ''

  const [held] = await db.select({ id: schema.memberships.id, userId: schema.memberships.userId, confirmedAt: schema.memberships.confirmedAt })
    .from(schema.memberships).where(eq(schema.memberships.id, id)).limit(1)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such membership' })
  if (held.confirmedAt !== null) throw createError({ statusCode: 409, statusMessage: 'That membership is already confirmed' })

  await db.batch([
    db.update(schema.memberships)
      .set({ confirmedAt: Math.floor(Date.now() / 1000), confirmedBy: resolved.account.id })
      .where(eq(schema.memberships.id, id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'membership.confirmed',
      target: `user:${held.userId}`,
      detail: { membership: id },
    })),
  ])

  return { ok: true }
})
