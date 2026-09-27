// The rooms performances close up to the booking horizon, with the bookings each overlaps, for the
// Theatre Manager to settle (issue 1347). Read-only: one goes only with its performance or room.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const now = Math.floor(Date.now() / 1000)
  const weeks = await configValue(event, 'ROOM_BOOKING_HORIZON_WEEKS')
  const items = await performanceClosuresListed(event, now, now + weeks * 7 * 86_400)
  return { items, total: items.length }
})
