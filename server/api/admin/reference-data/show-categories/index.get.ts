import { filterQuerySchema } from '#shared/utils/list-filters'
import { showCategoriesList } from '#shared/utils/show-categories-list'

const query = filterQuerySchema(showCategoriesList)

// Every show category, with whether a show belongs to it, filtered and ordered by its
// declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = showCategoriesClause(input)

  const total = await countShowCategoriesAdmin(clause)
  const items = await listShowCategoriesAdmin(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
