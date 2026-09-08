import { saleRefusal } from '#shared/utils/programme'

// Deliberately public: what the booking form needs before it asks for a name and an email
// (D-104). This route, never the cacheable public listing, is where entitlement is read (D-109 criterion 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const performance = await performanceById(id)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const refusal = saleRefusal(performance, new Date(), 'CUSTOMER')
  const account = await currentAccount(event)
  const isMember = account ? await hasCurrentMembership(event, account.id, new Date()) : false

  return {
    performanceId: id,
    showId: performance.showId,
    refusal: refusal && { reason: refusal.reason, says: refusal.says, closedAt: refusal.closedAt, externalBookingUrl: refusal.externalBookingUrl },
    cap: await configValue(event, 'PUBLIC_ORDER_SEAT_CAP'),
    ticketTypes: refusal ? [] : await bookableTicketTypes(id, performance.showId, isMember),
  }
})
