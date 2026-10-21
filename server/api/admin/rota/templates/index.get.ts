import { filterQuerySchema } from '#shared/utils/list-filters'
import { rotaTemplatesList } from '#shared/utils/rota-templates-list'

const query = filterQuerySchema(rotaTemplatesList)

// Every venue and the shift template it stamps, including the venues that have none, filtered
// by its declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = venueTemplatesClause(input)

  const [venues, total, houseDefaults] = await Promise.all([
    listVenueTemplates(clause, input.pageSize, offsetFor(input.page, input.pageSize)),
    countVenueTemplates(clause),
    shiftOffsetDefaults(event),
  ])
  const { items, ...page } = envelope(venues, total, input.page, input.pageSize)

  // What a blank offset stands for, so the form can say the number rather than "the default" (0140).
  return { venues: items, ...page, houseDefaults }
})
