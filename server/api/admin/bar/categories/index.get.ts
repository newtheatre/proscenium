import { barCategoriesList } from '#shared/utils/bar-categories-list'
import { filterQuerySchema } from '#shared/utils/list-filters'

const query = filterQuerySchema(barCategoriesList)

// The till's categories, filtered and ordered by their declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = categoriesClause(input)

  const total = await countCategories(clause)
  const items = await listCategories(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
