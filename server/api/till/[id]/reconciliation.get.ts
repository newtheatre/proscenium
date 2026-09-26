// Guarded by exactly what the close is guarded by (F-102 criterion 4, F-118 criterion 3): the
// two must never drift, so one answer serves both.

// The expected figure before anyone commits to closing, so nobody sees a figure they could not
// also act on.
export default defineEventHandler(async (event) => {
  await requireAccount(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Say which session you mean' })

  const session = await sessionById(id)
  if (!session) throw noSuch('till session')

  await closerFor(event, session)

  // Scoped to this session for the itemised lines; the whole-night figure the close compares ignores the scope.
  return nightReconciliation(session.night, { sessionId: session.id })
})
