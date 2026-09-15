import { saleForm } from '#shared/utils/sale'
import { londonDayOf } from '#shared/utils/ledger'

// Hand a basket to the SumUp app (F-124 criteria 1, 2): cross-checked and held on an attempt row,
// nothing posts until the app answers. Switched off, this says so and the typed figure stays.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, saleForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  const session = requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const config = useRuntimeConfig(event)
  if (!sumupEnabled(config.sumup)) {
    throw createError({ statusCode: 409, statusMessage: 'The SumUp hand-off is not switched on here. Key the figure into the reader.' })
  }
  if (input.tabHolderId) throw createError({ statusCode: 400, statusMessage: 'A tab charge never goes to the reader' })

  await refuseBookingsInOpenAttempts(resolved.night, input.tickets.map(ticket => ticket.reservationId))

  // The same cross-check the sale runs, without the write: a basket the till could not sell is
  // refused here, before the app is ever opened (criterion 2).
  const scope = {
    actorId: resolved.account.id,
    sessionId: session.id,
    venueId: resolved.venueId,
    night: resolved.night,
    performanceId: null,
    performanceIds: resolved.performanceIds,
    event,
  }
  // The cross-check hands back the house it resolved, so the hand-off pins the one the basket was
  // built against rather than resolving again minutes later when the app answers (F-126).
  const { performanceId } = await priceSaleForAttempt(input, londonDayOf(new Date()), scope)

  const id = await startAttempt({
    basket: {
      sale: input,
      sessionId: session.id,
      venueId: resolved.venueId,
      night: resolved.night,
      performanceId,
      performanceIds: resolved.performanceIds,
    },
    expectedTotalPence: input.expectedTotalPence,
    actorId: resolved.account.id,
  })
  const key = await attemptKeyFor(id)

  return {
    ok: true,
    id,
    totalPence: input.expectedTotalPence,
    launchUrl: launchUrlFor(config.sumup, config.public.baseURL, id, key, input.expectedTotalPence),
  }
})
