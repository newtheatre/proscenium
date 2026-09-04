// Every ticket type against this show: base price, this show's override, and what they resolve to.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await requirePermission(event, 'ticketing.read')

  const show = await showById(id)
  if (!show) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  return { items: await showPrices(id) }
})
