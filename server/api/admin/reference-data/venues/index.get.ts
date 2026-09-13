import { filterQuerySchema } from '#shared/utils/list-filters'
import { venuesList } from '#shared/utils/venues-list'

const query = filterQuerySchema(venuesList)

// Every venue, with whether it is in use, filtered and ordered by its declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = venuesClause(input)

  const total = await countVenuesAdmin(clause)
  const items = await listVenuesAdmin(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
