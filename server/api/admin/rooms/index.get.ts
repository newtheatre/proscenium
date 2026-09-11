import { filterQuerySchema } from '#shared/utils/list-filters'
import { roomsList } from '#shared/utils/rooms-list'

const query = filterQuerySchema(roomsList)

// The bookable estate, filtered by its declaration (K-129), and the estate-wide numbers each
// room falls back to.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await listRoomsFiltered(roomsClause(input))
  // Sent with the rooms so the editor can show what a blank override would mean, rather than
  // asking somebody to hold the settings screen in their head (C-106 criterion 4).
  return { items, total: items.length, estate: await estatePolicy(event) }
})
