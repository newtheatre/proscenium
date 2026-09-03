// Every venue and the shift template it stamps, including the venues that have none.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rota.read')
  return { venues: await listVenueTemplates() }
})
