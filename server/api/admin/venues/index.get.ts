// The venues a performance may be put in. Venue administration itself has no MVP story yet.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  return await listVenues()
})
