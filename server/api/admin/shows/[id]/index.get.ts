// One show with every performance of it, which is what the show screen reads.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await requirePermission(event, 'ticketing.read')

  const show = await showById(id)
  if (!show) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  return {
    show,
    performances: await showPerformances(id),
    venues: await listVenues(),
    warnings: await showWarnings(id),
    // A bounded vocabulary to pick from, not a list to browse: archived entries are left out
    // except where this show already carries one (D-102 criterion 1).
    vocabulary: [...(await warningKinds(id)).values()],
  }
})
