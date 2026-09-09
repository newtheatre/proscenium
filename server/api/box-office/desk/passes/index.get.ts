// What may be sold right now, for the desk's own issue screen (D-124 criteria 1, 4).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.write')
  return { items: await sellablePassTypes() }
})
