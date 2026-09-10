import { filterQuerySchema } from '#shared/utils/list-filters'
import { showsList } from '#shared/utils/shows-list'

const query = filterQuerySchema(showsList)

// Every show, drafts included, with how many performances each has and how many are on sale,
// filtered and ordered by its declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = showsClause(input)

  const total = await countShows(clause)
  const items = await listShows(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
