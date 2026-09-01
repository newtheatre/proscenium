import { EXTERNAL_STATUSES, OPEN_STATUSES } from '#shared/utils/external-requests'
import { noteFor, warningFor } from '#shared/utils/external-spaces'
import { z } from 'zod'

const query = z.object({
  // Settled ones stay readable, so an answer can be looked up rather than remembered.
  when: z.enum(['open', 'all']).default('open'),
})

// Union rooms asked for, and where each has got to.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.write')
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await externalQueue(input.when === 'open' ? OPEN_STATUSES : EXTERNAL_STATUSES)
  const notes = await notesFor({ spaceIds: items.flatMap(one => (one.preferredSpaceId ? [one.preferredSpaceId] : [])) })

  return {
    when: input.when,
    items: await Promise.all(items.map(async one => ({
      ...one,
      // What we know about the room they asked for, so the officer sees it before the union does.
      preferredWarning: warningFor(noteFor(notes, one.preferredSpaceId ?? '', one.purpose)),
      offers: await assignmentsFor(one.id),
    }))),
    total: items.length,
  }
})
