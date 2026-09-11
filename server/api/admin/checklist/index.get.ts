import { filterQuerySchema } from '#shared/utils/list-filters'
import { checklistVenuesList } from '#shared/utils/checklist-venues-list'

const query = filterQuerySchema(checklistVenuesList)

// Every venue and its active checklist items, for the committee's own overview screen,
// filtered by its declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'checklist.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = checklistVenuesClause(input)

  const [venues, total] = await Promise.all([
    listVenueChecklists(clause, input.pageSize, offsetFor(input.page, input.pageSize)),
    countVenueChecklists(clause),
  ])
  const { items, ...page } = envelope(venues, total, input.page, input.pageSize)

  return { venues: items, ...page }
})
