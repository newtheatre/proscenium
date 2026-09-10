// The desk's own view of a performance's waiting list: its length and who is next, in the order
// they would be offered (D-113 criterion 5).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const id = getRouterParam(event, 'id') ?? ''

  const performance = await performanceById(id)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const [summary, next] = await Promise.all([
    waitingListSummary(id),
    nextWaitingListEntriesForDesk(id, 20),
  ])

  return { summary, next }
})
