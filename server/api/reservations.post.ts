import { accessEntitlementRefusal, isEntitledToAccessTickets } from '#shared/utils/access-profiles'
import { saleRefusal } from '#shared/utils/programme'
import {
  RESERVATION_EMAIL_LIMIT,
  RESERVATION_EMAIL_WINDOW_MINUTES,
  RESERVATION_IP_LIMIT,
  RESERVATION_IP_WINDOW_MINUTES,
  bornExpiredReason,
  holdExpiresAt,
  overCapReason,
  reservationForm,
  resolveHoldReleaseMinutes,
  totalTickets,
} from '#shared/utils/reservations'

// Reserve tickets online, guest or signed in (D-104). No money moves and no ledger entry is
// written: the box office takes payment in person, on the night (0005).
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, reservationForm)

  await enforce(event, {
    scope: 'reservation:ip',
    value: clientIp(event),
    limit: RESERVATION_IP_LIMIT,
    windowMinutes: RESERVATION_IP_WINDOW_MINUTES,
  })

  const account = await currentAccount(event)
  // A signed-in booker's own details win; a guest's are the only way in otherwise
  // (criterion 1). Neither branch tells the caller which one ran.
  const email = account?.email ?? input.guest?.email
  const name = account?.name ?? input.guest?.name
  if (!email || !name) {
    throw createError({ statusCode: 400, statusMessage: 'A name and an email address are required to book as a guest' })
  }

  await enforce(event, {
    scope: 'reservation:email',
    value: email,
    limit: RESERVATION_EMAIL_LIMIT,
    windowMinutes: RESERVATION_EMAIL_WINDOW_MINUTES,
  })

  const performance = await performanceById(input.performanceId)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  // Every internal path asks this one question; a refusal here reads the same as the desk's own
  // (criterion 4, D-112). A web reservation never bypasses the window, so this is the only check.
  const refusal = saleRefusal(performance, new Date(), 'CUSTOMER')
  if (refusal) {
    throw createError({
      statusCode: 409,
      statusMessage: refusal.says,
      data: { reason: refusal.reason, closedAt: refusal.closedAt, externalBookingUrl: refusal.externalBookingUrl },
    })
  }

  const releaseMinutes = resolveHoldReleaseMinutes(
    performance.holdReleaseMinutesBefore,
    await configValue(event, 'HOLD_RELEASE_MINUTES_BEFORE'),
  )
  const expiresAt = holdExpiresAt(performance.startsAt, releaseMinutes)

  // Refused before a hold row exists, not cleaned up after: a booking that would already be
  // due for release the moment it is made is not a hold at all (committee decision, D-106).
  const bornExpired = bornExpiredReason(expiresAt, Math.floor(Date.now() / 1000))
  if (bornExpired) throw createError({ statusCode: 409, statusMessage: bornExpired })

  const cap = await configValue(event, 'PUBLIC_ORDER_SEAT_CAP')
  const capRefusal = overCapReason(input.lines, cap)
  if (capRefusal) throw createError({ statusCode: 400, statusMessage: capRefusal })

  // Re-checked here, not trusted from the booking screen's own read: a membership can lapse
  // between the two (D-109 criterion 1). A guest never holds a profile, so never entitled.
  const isMember = account ? await hasCurrentMembership(event, account.id, new Date()) : false
  const now = Math.floor(Date.now() / 1000)
  const profile = account ? await accessEntitlementProfile(account.id) : null
  const entitled = isEntitledToAccessTickets(profile, now)
  const resolved = new Map((await bookableTicketTypes(input.performanceId, performance.showId, isMember, entitled)).map(type => [type.id, type]))

  const lines = input.lines.map((line) => {
    const type = resolved.get(line.ticketTypeId)
    if (!type) throw createError({ statusCode: 400, statusMessage: 'No such ticket type for this performance' })
    return { ticketTypeId: type.id, quantity: line.quantity, pricePaid: type.price, priceSource: type.source, accessKind: type.accessKind }
  })

  const requestedAccess = { access: 0, companion: 0 }
  for (const line of lines) {
    if (line.accessKind === 'ACCESS') requestedAccess.access += line.quantity
    if (line.accessKind === 'COMPANION') requestedAccess.companion += line.quantity
  }
  if (requestedAccess.access > 0 || requestedAccess.companion > 0) {
    const held = await heldAccessCounts(account!.id, input.performanceId)
    const entitlementRefusal = accessEntitlementRefusal(requestedAccess, held, profile?.companions ?? 0)
    if (entitlementRefusal) throw createError({ statusCode: 409, statusMessage: entitlementRefusal })
  }

  const capacity = effectiveCapacity(performance)
  const booker = account ? { id: account.id } : await guestAccount(email, name)

  const result = await writeReservation({
    performanceId: input.performanceId,
    userId: booker.id,
    source: 'WEB',
    windowBypassed: false,
    lines,
    capacity,
    holdExpiresAt: expiresAt,
  })

  if (result.tickets.length < result.requested) {
    const wanted = totalTickets(input.lines)
    const capacityFailure = await currentCapacityRefusal(input.performanceId, capacity, wanted)
    throw createError({
      statusCode: 409,
      statusMessage: capacityFailure?.says ?? 'This performance no longer has room for that order',
    })
  }

  const qrToken = await qrTokenFor(result.id)

  // The batch committed, so the booking is real: send after, never before (0003).
  await sendReservationConfirmation(event, {
    userId: booker.id,
    reference: result.reference,
    showTitle: performance.showTitle,
    startsAt: performance.startsAt,
    totalPence: result.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0),
    qrToken,
  })

  return {
    reference: result.reference,
    status: 'PENDING' as const,
    performanceId: input.performanceId,
    tickets: result.tickets,
    totalPence: result.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0),
    qrToken,
  }
})
