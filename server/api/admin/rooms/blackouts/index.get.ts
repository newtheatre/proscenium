import { blackoutsList } from '#shared/utils/blackouts-list'
import { filterQuerySchema } from '#shared/utils/list-filters'

const query = filterQuerySchema(blackoutsList)

// Rooms that are closed, and why, filtered by its declaration (K-129). Past blackouts stay
// readable, because a cancelled booking points at one.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const items = await listBlackouts(blackoutsClause(input, Math.floor(Date.now() / 1000)))
  return { items, total: items.length }
})
