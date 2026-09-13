import { db } from '@nuxthub/db'
import { MAX_ACCESS_TICKETS_PER_PERFORMANCE, isEntitledToAccessTickets } from '#shared/utils/access-profiles'
import { remainingSeats, saleRefusal } from '#shared/utils/programme'
import { resolveHoldReleaseMinutes } from '#shared/utils/reservations'

// Deliberately public: what the booking form needs before it asks for a name and an email
// (D-104). This route, never the cacheable public listing, is where entitlement is read (D-109 criterion 2).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const performance = await performanceById(id)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  const saleState = saleRefusal(performance, new Date(), 'CUSTOMER')

  // A full house refuses the form up front rather than at submit, with the same waiting-list
  // offer the show page already makes for the same performance (D-101 criterion 2, D-113).
  const [house] = await db.all<{ held: number }>(heldSeatsQuery(id))
  const soldOut = !saleState && remainingSeats({ capacity: effectiveCapacity(performance), sold: Number(house?.held ?? 0) }) === 0
  const refusal = saleState ?? (soldOut
    ? { reason: 'SOLD_OUT' as const, says: 'This performance is sold out. Join the waiting list and we will email you the moment a seat frees up.' }
    : null)

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

  // Offered automatically (D-125 criterion 1), same gate an ordinary ticket type sits behind:
  // nothing is offered against a performance that is not on sale in the first place.
  const redeemablePass = !refusal && account ? await redeemablePassFor(account.id, id, performance.showId, now) : null

  // Allow-listed, and only what the form's own heading and summary read back: what a visitor is
  // about to book, so the page never has to fetch the show again to name it (D-104).
  return {
    performanceId: id,
    showId: performance.showId,
    show: { slug: performance.showSlug, title: performance.showTitle },
    performance: { startsAt: performance.startsAt, venueName: performance.venueName },
    refusal: refusal && {
      reason: refusal.reason,
      says: refusal.says,
      closedAt: 'closedAt' in refusal ? refusal.closedAt : undefined,
      externalBookingUrl: 'externalBookingUrl' in refusal ? refusal.externalBookingUrl : undefined,
      waitingListUrl: soldOut ? `/waiting-list/${id}` : undefined,
    },
    cap: await configValue(event, 'PUBLIC_ORDER_SEAT_CAP'),
    // The page quotes the figure it is actually held to, per-show override included, rather than
    // saying "shortly before curtain" (0012, D-106).
    holdReleaseMinutes: resolveHoldReleaseMinutes(performance.holdReleaseMinutesBefore, await configValue(event, 'HOLD_RELEASE_MINUTES_BEFORE')),
    ticketTypes: visible,
    accessEntitlement: remaining,
    redeemablePass,
  }
})
