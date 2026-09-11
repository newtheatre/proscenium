import { filterQuerySchema } from '#shared/utils/list-filters'
import { stocktakesList } from '#shared/utils/stocktakes-list'

const query = filterQuerySchema(stocktakesList)

// Every stocktake, filtered and ordered by its declaration (K-129): the history a mistake is
// corrected against with a new one rather than an edit (F-115 criterion 5).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = stocktakesClause(input)

  const total = await countStocktakes(clause)
  const items = await listStocktakes(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
