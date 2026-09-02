import { and, eq, isNull, sql } from 'drizzle-orm'

// Close a window early. Question 3, answered 2 September: whoever opened it may close it, with an
// administrator as the backstop. A window whose opener has graduated is the administrator's.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No window named' })

  const resolved = await requireTrainer(event)

  const [held] = await db.select({
    id: schema.practiceWindows.id,
    openedBy: schema.practiceWindows.openedBy,
    closedAt: schema.practiceWindows.closedAt,
  })
    .from(schema.practiceWindows)
    .where(eq(schema.practiceWindows.id, id))
    .limit(1)

  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such practice window' })

  // A window opened by a register has no opener of its own, so it is the administrator's to close.
  const mine = held.openedBy !== null && held.openedBy === resolved.account.id
  if (!mine && !resolved.permissions.has('training.write')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only whoever opened this window may close it, or an administrator',
    })
  }

  const now = Math.floor(Date.now() / 1000)
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'practice.window.closed',
    target: `practice-window:${id}`,
    detail: { own: mine },
  })

  // Idempotent by predicate: two closes produce one stamp and one entry, and the entry is written
  // first because the update would otherwise falsify the guard it rides on.
  const open = sql`(select 1 from practice_windows where id = ${id} and closed_at is null)`
  await db.batch([
    db.run(sql`
      insert into audit_log (id, actor_id, action, target, detail)
      select ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      where exists ${open}
    `),
    db.update(schema.practiceWindows)
      .set({ closedAt: now, closedBy: resolved.account.id })
      .where(and(eq(schema.practiceWindows.id, id), isNull(schema.practiceWindows.closedAt))),
  ])

  return { ok: true }
})
