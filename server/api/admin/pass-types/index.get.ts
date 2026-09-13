import { filterQuerySchema } from '#shared/utils/list-filters'
import { passTypesList } from '#shared/utils/pass-types-list'

const query = filterQuerySchema(passTypesList)

// Every pass product, with whether each has ever been issued, filtered and ordered by its
// declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = passTypesClause(input)

  const total = await countPassTypes(clause)
  const items = await listPassTypes(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
