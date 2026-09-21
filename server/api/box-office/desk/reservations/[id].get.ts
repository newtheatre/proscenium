// A booking's detail for the collection screen: who holds it, what it holds, and its status.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'ticketing.read')
  const id = getRouterParam(event, 'id') ?? ''

  const reservation = await deskReservation(id)
  if (!reservation) throw noSuch('booking', 'Check the reference and try again')

  return reservation
})
