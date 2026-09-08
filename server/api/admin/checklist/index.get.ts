// Every venue and its active checklist items, for the committee's own overview screen.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'checklist.read')
  return { venues: await listVenueChecklists() }
})
