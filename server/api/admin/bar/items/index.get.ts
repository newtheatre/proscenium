import { barItemsList } from '#shared/utils/bar-items-list'
import { filterQuerySchema } from '#shared/utils/list-filters'

const query = filterQuerySchema(barItemsList)

// Every stocked item, filtered and ordered by its declaration (K-129), each with what is on
// hand: the sum of its movements, computed here.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = itemsClause(input)

  const total = await countItems(clause)
  const items = await listItems(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
