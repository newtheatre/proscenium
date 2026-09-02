import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

const form = z.object({
  targetKey: z.string().trim().min(1).max(40),
  userId: z.string().trim().min(1).max(64),
})

// Open a window by hand, for somebody taught outside a register. Trainers may do this: it is the
// same authority that opens one by marking a register (G-126 criterion 5).
export default defineEventHandler(async (event) => {
  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, form)

  const [target] = await db.select({
    key: schema.practiceTargets.key,
    windowHours: schema.practiceTargets.windowHours,
    isActive: schema.practiceTargets.isActive,
  })
    .from(schema.practiceTargets)
    .where(eq(schema.practiceTargets.key, input.targetKey))
    .limit(1)

  if (!target) throw createError({ statusCode: 404, statusMessage: 'No such practice target' })
  if (!target.isActive) {
    throw createError({ statusCode: 409, statusMessage: 'That practice surface is not in use at the moment' })
  }

  const person = await findById(input.userId)
  if (!person) throw createError({ statusCode: 404, statusMessage: 'No such person' })

  // An open window is extended rather than duplicated: two of them would expire at different
  // times and the later one would look like access the earlier had already ended.
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + target.windowHours * 3600
  const extended = await db.update(schema.practiceWindows)
    .set({ expiresAt })
    .where(and(
      eq(schema.practiceWindows.userId, input.userId),
      eq(schema.practiceWindows.targetKey, input.targetKey),
      isNull(schema.practiceWindows.closedAt),
      sql`${schema.practiceWindows.expiresAt} > ${now}`,
    ))
    .returning({ id: schema.practiceWindows.id })

  const id = extended[0]?.id ?? newId()
  await db.batch([
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'practice.window.opened',
      target: `practice-window:${id}`,
      detail: { targetKey: input.targetKey, subject: input.userId, extended: extended.length > 0 },
    })),
    ...(extended.length > 0
      ? []
      : [db.insert(schema.practiceWindows).values({
          id,
          targetKey: input.targetKey,
          userId: input.userId,
          opensAt: now,
          expiresAt,
          openedBy: resolved.account.id,
        })]),
  ])

  return { ok: true, id, extended: extended.length > 0 }
})
