import { startAttemptForm } from '#shared/utils/sumup'
import { londonDayOf } from '#shared/utils/ledger'

// Start a card charge (F-124 criteria 1, 2; 0096): cross-checked and held on an attempt row, and
// nothing posts until it is answered, by the SumUp app or by the person at the reader.
export default defineEventHandler(async (event) => {
  const { kind, ...input } = await readValidatedBodyOrThrow(event, startAttemptForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  const session = requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const config = useRuntimeConfig(event)
  const handOff = kind === 'SUMUP' ? config.sumup : null
  if (handOff !== null && !sumupEnabled(handOff)) {
    throw createError({ statusCode: 409, statusMessage: 'The SumUp hand-off is not switched on here. Key the figure into the reader.' })
  }
  if (input.tabHolderId) throw createError({ statusCode: 400, statusMessage: 'A tab charge never goes to the reader' })

  await refuseBookingsInOpenAttempts(resolved.night, input.tickets.map(ticket => ticket.reservationId))

  // The same cross-check the sale runs, without the write: a basket the till could not sell is
  // refused here, before the reader is ever asked for it (criterion 2).
  const scope = {
    actorId: resolved.account.id,
    sessionId: session.id,
    venueId: resolved.venueId,
    night: resolved.night,
    performanceId: null,
    performanceIds: resolved.performanceIds,
    event,
  }
  // The cross-check hands back the house it resolved, so the attempt pins the one the basket was
  // built against rather than resolving again minutes later when it is answered (F-126).
  const { performanceId } = await priceSaleForAttempt(input, londonDayOf(new Date()), scope)

  const id = await startAttempt({
    kind,
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

  // A typed charge has nothing to open and no key: it is answered on the till, never by a return.
  if (handOff === null) return { ok: true, id, kind, totalPence: input.expectedTotalPence }

  const key = await attemptKeyFor(id)
  return {
    ok: true,
    id,
    kind,
    totalPence: input.expectedTotalPence,
    launchUrl: launchUrlFor(handOff, config.public.baseURL, id, key, input.expectedTotalPence),
  }
})
