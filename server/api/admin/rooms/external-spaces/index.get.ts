import { externalSpacesList } from '#shared/utils/external-spaces-list'
import { filterQuerySchema } from '#shared/utils/list-filters'

const query = filterQuerySchema(externalSpacesList)

const CATALOGUE_CAP = 200

// The SU catalogue, with every note against each room, filtered by its declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await listSpacesFiltered(spacesClause(input), CATALOGUE_CAP)
  const notes = await notesFor({ spaceIds: items.map(space => space.id) })

  return {
    items: items.map(space => ({ ...space, notes: notes.filter(note => note.spaceId === space.id) })),
    total: items.length,
  }
})
