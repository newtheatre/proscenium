// Where a booking could go instead, nearest first, before anybody is bumped.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.write')
  const id = getRouterParam(event, 'id') ?? ''

  const displaced = await displacedBooking(id)
  if (!displaced) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  const candidates = await alternativesFor(displaced)
  const best = nearestTo(displaced, candidates)

  return { nearest: best ?? null, total: candidates.length }
})
