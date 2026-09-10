import { MAX_ACCESS_TICKETS_PER_PERFORMANCE, isEntitledToAccessTickets } from '#shared/utils/access-profiles'
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

  const now = Math.floor(Date.now() / 1000)
  const profile = account ? await accessEntitlementProfile(account.id) : null
  const entitled = isEntitledToAccessTickets(profile, now)
  // Remaining, not the raw entitlement: what a held access or companion ticket already used is
  // never offered again on this same performance (D-128 criterion 2).
  const held = entitled && account ? await heldAccessCounts(account.id, id) : { access: 0, companion: 0 }
  const remaining = entitled
    ? { access: Math.max(0, MAX_ACCESS_TICKETS_PER_PERFORMANCE - held.access), companion: Math.max(0, (profile?.companions ?? 0) - held.companion) }
    : null

  const ticketTypes = refusal ? [] : await bookableTicketTypes(id, performance.showId, isMember, entitled)
  // Exhausted for this performance is not offered again, whatever else the type would allow
  // (D-128 criterion 2): an access or companion row past its own remaining count is dropped here.
  const visible = remaining === null
    ? ticketTypes
    : ticketTypes.filter(type =>
        (type.accessKind !== 'ACCESS' || remaining.access > 0) && (type.accessKind !== 'COMPANION' || remaining.companion > 0))

  return {
    performanceId: id,
    showId: performance.showId,
    refusal: refusal && { reason: refusal.reason, says: refusal.says, closedAt: refusal.closedAt, externalBookingUrl: refusal.externalBookingUrl },
    cap: await configValue(event, 'PUBLIC_ORDER_SEAT_CAP'),
    ticketTypes: visible,
    accessEntitlement: remaining,
  }
})
