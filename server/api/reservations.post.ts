import { saleRefusal } from '#shared/utils/programme'
import {
  RESERVATION_EMAIL_LIMIT,
  RESERVATION_EMAIL_WINDOW_MINUTES,
  RESERVATION_IP_LIMIT,
  RESERVATION_IP_WINDOW_MINUTES,
  overCapReason,
  reservationForm,
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

  const cap = await configValue(event, 'PUBLIC_ORDER_SEAT_CAP')
  const capRefusal = overCapReason(input.lines, cap)
  if (capRefusal) throw createError({ statusCode: 400, statusMessage: capRefusal })

  // Resolved against the performance, never the show alone: a performance-level override can
  // price or retire a type the show still offers.
  const resolved = new Map((await bookableTicketTypes(input.performanceId, performance.showId)).map(type => [type.id, type]))

  const lines = input.lines.map((line) => {
    const type = resolved.get(line.ticketTypeId)
    if (!type) throw createError({ statusCode: 400, statusMessage: 'No such ticket type for this performance' })
    return { ticketTypeId: type.id, quantity: line.quantity, pricePaid: type.price, priceSource: type.source }
  })

  const capacity = effectiveCapacity(performance)
  const booker = account ? { id: account.id } : await guestAccount(email, name)

  const result = await writeReservation({
    performanceId: input.performanceId,
    userId: booker.id,
    source: 'WEB',
    windowBypassed: false,
    lines,
    capacity,
  })

  if (result.tickets.length < result.requested) {
    const wanted = totalTickets(input.lines)
    const capacityFailure = await currentCapacityRefusal(input.performanceId, capacity, wanted)
    throw createError({
      statusCode: 409,
      statusMessage: capacityFailure?.says ?? 'This performance no longer has room for that order',
    })
  }

  return {
    reference: result.reference,
    status: 'PENDING' as const,
    performanceId: input.performanceId,
    tickets: result.tickets,
    totalPence: result.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0),
  }
})
