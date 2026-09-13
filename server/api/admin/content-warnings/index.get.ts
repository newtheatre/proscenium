import { filterQuerySchema } from '#shared/utils/list-filters'
import { contentWarningsList } from '#shared/utils/content-warnings-list'

const query = filterQuerySchema(contentWarningsList)

// The warning vocabulary, filtered and ordered by its declaration (K-129). Each row says how many
// shows carry it, so an entry in use can be seen to be in use before anybody tries to delete it.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const clause = contentWarningsClause(input)

  const total = await countContentWarnings(clause)
  const items = await listContentWarnings(clause, input.pageSize, offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})
