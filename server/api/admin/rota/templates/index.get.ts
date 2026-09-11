import { filterQuerySchema } from '#shared/utils/list-filters'
import { rotaTemplatesList } from '#shared/utils/rota-templates-list'

const query = filterQuerySchema(rotaTemplatesList)

// Every venue and the shift template it stamps, including the venues that have none, filtered
// by its declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = venueTemplatesClause(input)

  const [venues, total] = await Promise.all([
    listVenueTemplates(clause, input.pageSize, offsetFor(input.page, input.pageSize)),
    countVenueTemplates(clause),
  ])
  const { items, ...page } = envelope(venues, total, input.page, input.pageSize)

  return { venues: items, ...page }
})
