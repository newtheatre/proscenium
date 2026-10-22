import { pageQuery } from '#shared/utils/pagination'

// Every version of one venue's emergency card, newest first: the card is append-only, so this is
// its whole history (E-113 criterion 1, 0217).
export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'id') ?? ''
  await requirePermission(event, 'emergency-card.read')
  const { page, pageSize } = await getValidatedQueryOrThrow(event, pageQuery)

  const venue = (await listVenues()).find(one => one.id === venueId)
  if (!venue) throw noSuch('venue')

  const [items, total] = await Promise.all([
    cardVersions(venueId, pageSize, offsetFor(page, pageSize)),
    countCardVersions(venueId),
  ])
  return envelope(items, total, page, pageSize)
})
