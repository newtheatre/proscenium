import { filterQuerySchema } from '#shared/utils/list-filters'
import { ticketTypesList } from '#shared/utils/ticket-types-list'

const query = filterQuerySchema(ticketTypesList)

// Every ticket type, with whether each has ever been sold, filtered and ordered by its
// declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = ticketTypesClause(input)

  const total = await countTicketTypes(clause)
  const items = await listTicketTypes(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
