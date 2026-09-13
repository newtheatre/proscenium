import { filterQuerySchema } from '#shared/utils/list-filters'
import { seasonsList } from '#shared/utils/seasons-list'

const query = filterQuerySchema(seasonsList)

// Every season, with whether a show belongs to it, filtered and ordered by its declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = seasonsClause(input)

  const total = await countSeasonsAdmin(clause)
  const items = await listSeasonsAdmin(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
