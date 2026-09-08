import { saleRefusal } from '#shared/utils/programme'

// Deliberately public: what the booking form needs before it asks for a name and an email
// (D-104). Writing the order still asks `saleRefusal` again at the moment it matters. The
// entitlement check here is what keeps `/api/whats-on` and `/api/shows/[slug]` cacheable and
// viewer-independent: this route, never those, is where a signed-in caller's own state answers
// which types they may reserve (D-109 criterion 2).
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
