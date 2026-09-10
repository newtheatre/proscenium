// A manual offer, triggered by an officer rather than the automatic sweep, for example after an
// informal return the sweep cannot see (D-113 criterion 5). Same rule either way: budgeted, in order.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.write')
  const id = getRouterParam(event, 'id') ?? ''

  const performance = await performanceById(id)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const cap = await configValue(event, 'WAITING_LIST_OFFER_BATCH_CAP')
  const run = await offerWaitingList(event, id, new Date(), cap)
  await notifyWaitingListOffers(event, run.offered)

  return { offered: run.offered.length }
})
