import { londonDayOf } from '#shared/utils/ledger'
import { needsTheReader, saleForm } from '#shared/utils/sale'

// The submission boundary (F-104) and the atomic commit (F-105): drinks, a Challenge 25 outcome,
// a discount, a tab, a booking's ticket money (F-122) and a walk-up (F-123) batch together.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, saleForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })

  // Money on the reader is recorded only once the reader has answered for it (0096): that is an
  // attempt, and this one step is left to what involves no reader at all.
  if (needsTheReader(input)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A card sale is recorded once the reader has taken it. Charge it from the till, then answer there.',
    })
  }

  const session = requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  // A booking inside a SumUp hand-off still waiting for its answer cannot be charged again by
  // hand (F-124 criterion 7).
  await refuseBookingsInOpenAttempts(resolved.night, input.tickets.map(ticket => ticket.reservationId))

  const committed = await commitSale(
    input.lines, londonDayOf(new Date()), input.expectedTotalPence, input.ageCheck, input.discountId, input.tabHolderId,
    {
      actorId: resolved.account.id,
      sessionId: session.id,
      venueId: resolved.venueId,
      night: resolved.night,
      // Which house a basket belongs to is the bar's own windows' answer, worked out inside the
      // sale rather than guessed from the count here (F-126, 0078).
      performanceId: null,
      performanceIds: resolved.performanceIds,
      baseURL: useRuntimeConfig(event).public.baseURL,
      event,
    },
    { tickets: input.tickets, walkUps: input.walkUps, walkUpGuest: input.walkUpGuest },
  )

  return { ok: true, ...committed }
})
