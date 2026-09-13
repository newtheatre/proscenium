import { deskSearchForm } from '#shared/utils/desk'

// Reference, or a name, scoped to the performance on screen and paged (criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { performanceId, q, status, page, pageSize } = await getValidatedQueryOrThrow(event, deskSearchForm)

  const total = await countDeskSearch(performanceId, q, status)
  const items = await deskSearch(performanceId, q, status, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
