import { refreshBadgeStatement, withdrawStatement } from '#shared/utils/training-signup'

// Withdraw from a session. Open while the register is, because somebody who cannot come should
// always be able to say so (G-105 criterion 5).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) throw createError({ statusCode: 400, statusMessage: 'No session named' })

  const session = await sessionForSignUp(sessionId)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such session' })

  // Read before the write, because a promotion is the difference the write made. Nothing is
  // decided from it: the claim is what decides, and it is a write (G-106 criterion 2).
  const before = await placesOnSession(sessionId)

  const [withdrawn] = await db.batch([
    db.all<{ id: string }>(withdrawStatement(sessionId, account.id)),
    db.run(refreshBadgeStatement(sessionId)),
  ])

  // Nothing to withdraw is not an error worth a page: they are not on the list either way.
  if (withdrawn.length === 0) return { ok: true, withdrawn: 0, promoted: 0 }

  const promoted = await notifyPromotions(event, sessionId, before.places)
  return { ok: true, withdrawn: 1, promoted }
})
