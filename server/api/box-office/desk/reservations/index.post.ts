import { deskSaleForm } from '#shared/utils/desk'
import { saleRefusal } from '#shared/utils/programme'
import { holdExpiresAt, resolveHoldReleaseMinutes } from '#shared/utils/reservations'
import { saysPrice } from '#shared/utils/ticket-types'

// A walk-up sale: the reservation is created and paid for in one flow, source DOOR at creation,
// never defaulted (D-115 criterion 1). No money moves until the cross-check below passes (0005).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'ticketing.write')
  const input = await readValidatedBodyOrThrow(event, deskSaleForm)

  const performance = await performanceById(input.performanceId)
  if (!performance) throw createError({ statusCode: 404, statusMessage: 'No such performance' })

  // The desk sells past the customer window; nothing else about the refusal moves (D-112
  // criterion 3, D-115 criterion 3): cancelled, unpublished or external still refuses here too.
  const refusal = saleRefusal(performance, new Date(), 'DESK')
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal.says })

  // Recorded only when the window is genuinely what a customer sale would have been refused for.
  const windowBypassed = saleRefusal(performance, new Date(), 'CUSTOMER')?.reason === 'WINDOW_CLOSED'

  const resolvedTypes = new Map((await bookableTicketTypes(input.performanceId, performance.showId, false, false)).map(type => [type.id, type]))
  const ticketTypeNames = new Map<string, string>()
  const lines = input.lines.map((line) => {
    const type = resolvedTypes.get(line.ticketTypeId)
    if (!type) throw createError({ statusCode: 400, statusMessage: 'No such ticket type for this performance' })
    ticketTypeNames.set(type.id, type.name)
    return { ticketTypeId: type.id, quantity: line.quantity, pricePaid: type.price, priceSource: type.source }
  })

  const ticketTotalPence = lines.reduce((total, line) => total + line.pricePaid * line.quantity, 0)
  if (ticketTotalPence !== input.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysPrice(input.expectedTotalPence)}; the desk now reads ${saysPrice(ticketTotalPence)}. Nothing has been charged: check the order and try again.`,
    })
  }

  const capacity = effectiveCapacity(performance)
  const releaseMinutes = resolveHoldReleaseMinutes(performance.holdReleaseMinutesBefore, await configValue(event, 'HOLD_RELEASE_MINUTES_BEFORE'))
  const booker = await guestAccount(input.guest.email, input.guest.name)

  const outcome = await sellWalkUp({
    performanceId: input.performanceId,
    userId: booker.id,
    lines,
    capacity,
    windowBypassed,
    holdExpiresAt: holdExpiresAt(performance.startsAt, releaseMinutes),
    expectedTotalPence: input.expectedTotalPence,
    actorId: resolved.account.id,
  }, ticketTypeNames)

  if (!outcome.applied) {
    throw createError({ statusCode: 409, statusMessage: 'This performance no longer has room for that order' })
  }

  return { ok: true, reference: outcome.result.reference, entryId: outcome.result.entryId, totalPence: outcome.result.totalPence }
})
