import { strandedQuery } from '#shared/utils/blackouts'

// What closing a span would cancel, counted before anything is closed, because reopening restores
// nothing (C-114 criteria 3 and 5, issue 1353). The same read the close itself makes.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.write')
  const input = await getValidatedQueryOrThrow(event, strandedQuery)

  const stranded = await bookingsUnder({
    roomId: input.roomId ?? null,
    startsAt: Math.floor(new Date(input.startsAt).getTime() / 1000),
    endsAt: Math.floor(new Date(input.endsAt).getTime() / 1000),
  })
  return { count: stranded.length }
})
