// Every ticket type against this performance: base, the show's override, this one's, and what they
// resolve to, so an operator can see why a price is what it is (D-120 criterion 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await requirePermission(event, 'ticketing.read')

  const performance = await performanceById(id)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  return { items: await performancePrices(id) }
})
