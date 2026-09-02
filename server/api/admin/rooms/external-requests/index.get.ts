import { EXTERNAL_STATUSES, OPEN_STATUSES } from '#shared/utils/external-requests'
import { noteFor, warningFor } from '#shared/utils/external-spaces'
import { z } from 'zod'

const query = z.object({
  // Settled ones stay readable, so an answer can be looked up rather than remembered.
  when: z.enum(['open', 'all']).default('open'),
})

// Rooms we do not manage, asked for, and where each has got to.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.write')
  const input = await getValidatedQueryOrThrow(event, query)

  const found = await externalQueue(input.when === 'open' ? OPEN_STATUSES : EXTERNAL_STATUSES)
  const items = found.slice(0, LIST_CAP)
  const notes = await notesFor({ spaceIds: items.flatMap(one => (one.preferredSpaceId ? [one.preferredSpaceId] : [])) })
  const offers = await assignmentsFor(items.map(one => one.id))

  return {
    when: input.when,
    items: items.map(one => ({
      ...one,
      // What we know about the room they asked for, so the officer sees it before asking.
      preferredWarning: warningFor(noteFor(notes, one.preferredSpaceId ?? '', one.purpose)),
      offers: offers.get(one.id) ?? [],
    })),
    total: items.length,
    more: found.length > LIST_CAP,
  }
})
