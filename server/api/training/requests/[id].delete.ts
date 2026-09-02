import { and, eq } from 'drizzle-orm'

// Withdraw an ask. Idempotent by predicate, and withdrawing frees the re-ask (criterion 1).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'No request named' })

  const withdrawn = await db.update(schema.moduleRequests)
    .set({ status: 'WITHDRAWN', decidedAt: Math.floor(Date.now() / 1000) })
    .where(and(
      eq(schema.moduleRequests.id, id),
      eq(schema.moduleRequests.userId, account.id),
      eq(schema.moduleRequests.status, 'OPEN'),
    ))
    .returning({ id: schema.moduleRequests.id })

  // Nothing to withdraw is not an error worth a page: the request is not open either way.
  return { ok: true, withdrawn: withdrawn.length }
})
