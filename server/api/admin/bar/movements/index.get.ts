import { barMovementsList } from '#shared/utils/bar-movements-list'
import { filterQuerySchema } from '#shared/utils/list-filters'

const query = filterQuerySchema(barMovementsList)

// The movement history, filtered and ordered by its declaration (K-129): what every on-hand
// figure is the sum of.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'bar.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = movementsClause(input)

  const total = await countMovements(clause)
  const items = await listMovements(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
