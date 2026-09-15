// Guarded by exactly what the close is guarded by (F-102 criterion 4, F-118 criterion 3): the
// two must never drift, so one answer serves both.

// The expected figure before anyone commits to closing, so nobody sees a figure they could not
// also act on.
export default defineEventHandler(async (event) => {
  await requireAccount(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Which session' })

  const session = await sessionById(id)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such till session' })

  await closerFor(event, session)

  return nightReconciliation(session.night)
})
