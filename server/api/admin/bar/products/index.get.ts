import { barProductsList } from '#shared/utils/bar-products-list'
import { filterQuerySchema } from '#shared/utils/list-filters'

const query = filterQuerySchema(barProductsList)

// Every product, filtered and ordered by its declaration (K-129), with whether each has ever sold.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = productsClause(input)

  const total = await countProducts(clause)
  const items = await listProducts(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
