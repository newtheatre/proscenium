import { londonDayOf } from '#shared/utils/ledger'
import { saleForm } from '#shared/utils/sale'

// The submission boundary (F-104) and the atomic commit (F-105): drinks, a Challenge 25 outcome,
// a discount, a tab, a booking's ticket money (F-122) and a walk-up (F-123) batch together.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, saleForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
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
      // A basket sells for the whole night, not one performance; naming one is only honest when the
      // till's own authority resolved to exactly one (E-118 criterion 4's nullable performance_id).
      performanceId: resolved.performanceIds.length === 1 ? resolved.performanceIds[0]! : null,
      performanceIds: resolved.performanceIds,
      baseURL: useRuntimeConfig(event).public.baseURL,
      event,
    },
    { tickets: input.tickets, walkUps: input.walkUps, walkUpGuest: input.walkUpGuest },
  )

  return { ok: true, ...committed }
})
