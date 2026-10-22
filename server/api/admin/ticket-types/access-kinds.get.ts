// Whether an access and a companion ticket type exist, for the warning on the ticket types and
// access profiles screens; the Secretary verifying profiles may hold no ticketing permission.
export default defineEventHandler(async (event) => {
  await requireAnyPermission(event, ['ticketing.read', 'access.verify'])
  return await accessKindsOnOffer()
})
