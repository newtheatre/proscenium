// The expected figure before anyone commits to closing (F-102 criterion 4, F-118 criterion 3),
// guarded like the close it previews so nobody sees a figure they could not also act on.
export default defineEventHandler(async (event) => {
  await requireAccount(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Which session' })

  const session = await sessionById(id)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'No such till session' })

  await closerFor(event, session)

  return nightReconciliation(session.night)
})
