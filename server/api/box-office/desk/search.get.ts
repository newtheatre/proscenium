import { deskSearchForm } from '#shared/utils/desk'

// Reference, or a name, scoped to the performance on screen and paged (criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const { performanceId, q, page, pageSize } = await getValidatedQueryOrThrow(event, deskSearchForm)

  const total = await countDeskSearch(performanceId, q)
  const items = await deskSearch(performanceId, q, pageSize, offsetFor(page, pageSize))

  return envelope(items, total, page, pageSize)
})
