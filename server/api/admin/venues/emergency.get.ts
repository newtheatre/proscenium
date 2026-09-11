import { filterQuerySchema } from '#shared/utils/list-filters'
import { emergencyCardsList } from '#shared/utils/emergency-cards-list'

const query = filterQuerySchema(emergencyCardsList)

// Every venue and its current emergency card, including a venue with none yet, filtered by its
// declaration (E-113 criterion 1, K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'emergency-card.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = emergencyCardsClause(input)

  const [venues, total] = await Promise.all([
    currentCards(clause, input.pageSize, offsetFor(input.page, input.pageSize)),
    countVenuesForCards(clause),
  ])
  const { items, ...page } = envelope(venues, total, input.page, input.pageSize)

  return { venues: items, ...page }
})
