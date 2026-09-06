import { saleRefusal } from '#shared/utils/programme'

// Deliberately public: what the booking form needs before it asks for a name and an email
// (D-104). Writing the order still asks `saleRefusal` again at the moment it matters.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const performance = await performanceById(id)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const refusal = saleRefusal(performance, new Date(), 'CUSTOMER')

  return {
    performanceId: id,
    showId: performance.showId,
    refusal: refusal && { reason: refusal.reason, says: refusal.says, closedAt: refusal.closedAt, externalBookingUrl: refusal.externalBookingUrl },
    cap: await configValue(event, 'PUBLIC_ORDER_SEAT_CAP'),
    ticketTypes: refusal ? [] : await bookableTicketTypes(id, performance.showId),
  }
})
