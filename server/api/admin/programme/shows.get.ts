// Every show, for a picker rather than a browse: a draft show can be covered by a pass ahead of
// its own publication, so nothing here is filtered by status (D-123).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  return await listShowOptions()
})
