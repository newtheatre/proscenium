import { deskSaleForm, walkUpShortSays } from '#shared/utils/desk'
import { saleRefusal } from '#shared/utils/programme'
import { holdExpiresAt } from '#shared/utils/reservations'
import { saysPrice } from '#shared/utils/ticket-types'

// A walk-up sale: the reservation is created and paid for in one flow, source DOOR at creation,
// never defaulted (D-115 criterion 1). No money moves until the cross-check below passes (0005).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, deskSaleForm)

  const performance = await performanceById(input.performanceId)
  if (!performance) throw noSuch('performance')

  // The desk sells past the customer window; nothing else about the refusal moves (D-112
  // criterion 3, D-115 criterion 3): cancelled, unpublished or external still refuses here too.
  const refusal = saleRefusal(performance, new Date(), 'DESK')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal.says })

  // Recorded only when the window is genuinely what a customer sale would have been refused for.
  const windowBypassed = saleRefusal(performance, new Date(), 'CUSTOMER')?.reason === 'WINDOW_CLOSED'

  const resolvedTypes = new Map((await bookableTicketTypes(input.performanceId, performance.showId, false, false)).map(type => [type.id, type]))
  const lines = input.lines.map((line) => {
    const type = resolvedTypes.get(line.ticketTypeId)
    if (!type) throw createError({ statusCode: 400, statusMessage: saysNoSuch('ticket type', 'Choose one of the ticket types this performance offers') })
    return { ticketTypeId: type.id, quantity: line.quantity, pricePaid: type.price, priceSource: type.source }
  })

  const ticketTotalPence = lines.reduce((total, line) => total + line.pricePaid * line.quantity, 0)
  if (ticketTotalPence !== input.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysPrice(input.expectedTotalPence)}; the desk now reads ${saysPrice(ticketTotalPence)}. Nothing has been charged: check the order and try again.`,
    })
  }

  // Read before any account is made, so an order the house never had room for refuses in its own
  // words and leaves nobody behind; the predicate on the write still decides a race (D-105).
  const capacity = effectiveCapacity(performance)
  const wanted = lines.reduce((total, line) => total + line.quantity, 0)
  const remaining = capacity === null ? null : Math.max(0, capacity - Number(performance.soldTickets))
  if (remaining !== null && wanted > remaining) throw createError({ statusCode: 409, statusMessage: walkUpShortSays(remaining) })

  const bookerRefusal = await walkUpBookerRefusal(input.guest)
  if (bookerRefusal) throw createError({ statusCode: 409, statusMessage: bookerRefusal })

  const releaseMinutes = await holdReleaseMinutesFor(event, performance)
  const booker = input.guest ? await guestAccount(input.guest.email, input.guest.name) : null

  const outcome = await sellWalkUp({
    performanceId: input.performanceId,
    userId: booker?.id ?? null,
    lines,
    capacity,
    windowBypassed,
    holdExpiresAt: holdExpiresAt(performance.startsAt, releaseMinutes),
    expectedTotalPence: input.expectedTotalPence,
    actorId: resolved.account.id,
  })

  if (!outcome.applied) {
    throw createError({ statusCode: 409, statusMessage: 'This performance filled while the sale was being made. Nothing has been charged.' })
  }

  // The booker who gave an address gets the paid confirmation and its QR, as the till's does (D-115
  // criterion 6); the sale has committed, so a send that fails never unsells it.
  if (booker) {
    await sendWalkUpPaid(event, {
      userId: booker.id,
      reference: outcome.result.reference,
      showTitle: performance.showTitle,
      startsAt: performance.startsAt,
      paidPence: outcome.result.totalPence,
      qrToken: await qrTokenFor(outcome.result.reservationId),
      paidAt: 'DESK',
    })
  }

  return { ok: true, reference: outcome.result.reference, entryId: outcome.result.entryId, totalPence: outcome.result.totalPence }
})
