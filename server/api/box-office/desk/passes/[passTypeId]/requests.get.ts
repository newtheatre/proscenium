// Pending requests for one product, by name, for one-tap fulfilment at payment (D-124 criterion 3).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.write')
  const passTypeId = getRouterParam(event, 'passTypeId') ?? ''
  return { items: await pendingPassRequests(passTypeId) }
})
