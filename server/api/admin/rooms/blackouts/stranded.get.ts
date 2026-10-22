import { strandedQuery } from '#shared/utils/blackouts'

// What closing a span would cancel, by the same read the close makes, since reopening restores
// nothing (C-114 criteria 3 and 5, issue 1353); and the closures already over it, to warn of.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.write')
  const input = await getValidatedQueryOrThrow(event, strandedQuery)

  const span = {
    roomId: input.roomId ?? null,
    startsAt: Math.floor(new Date(input.startsAt).getTime() / 1000),
    endsAt: Math.floor(new Date(input.endsAt).getTime() / 1000),
  }
  const [stranded, overlapping] = await Promise.all([
    bookingsUnder(span),
    closuresOverlapping(span.roomId, span.startsAt, span.endsAt),
  ])
  return { count: stranded.length, overlapping }
})
