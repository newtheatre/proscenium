import { filterQuerySchema } from '#shared/utils/list-filters'
import { performancesList } from '#shared/utils/performances-list'
import { resolveHoldReleaseMinutes } from '#shared/utils/reservations'

const query = filterQuerySchema(performancesList)

// One show's performances, filtered and paged in SQL by its declaration (D-132, K-129).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  await requirePermission(event, 'ticketing.read')

  const show = await showById(id)
  if (!show) throw noSuch('show')

  const input = await getValidatedQueryOrThrow(event, query)
  const clause = performancesClause(input)

  const total = await countShowPerformances(id, clause)
  const listed = await listShowPerformances(id, clause, input.pageSize, offsetFor(input.page, input.pageSize))
  // Each row says when online booking really closes, which the hold release can bring forward (D-112).
  const house = await configValue(event, 'HOLD_RELEASE_MINUTES_BEFORE')
  const items = listed.map(one => ({ ...one, holdReleaseMinutes: resolveHoldReleaseMinutes(one.holdReleaseMinutesBefore, house) }))

  return envelope(items, total, input.page, input.pageSize)
})
