import { filterQuerySchema } from '#shared/utils/list-filters'
import { performancesList } from '#shared/utils/performances-list'

const query = filterQuerySchema(performancesList)

// One show's performances, filtered and paged in SQL by its declaration (D-132, K-129).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await requirePermission(event, 'ticketing.read')

  const show = await showById(id)
  if (!show) throw createError({ statusCode: 404, statusMessage: 'No such show' })

  const input = await getValidatedQueryOrThrow(event, query)
  const clause = performancesClause(input)

  const total = await countShowPerformances(id, clause)
  const items = await listShowPerformances(id, clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
