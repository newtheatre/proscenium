import { basketForm } from '#shared/utils/sale'
import { londonDayOf } from '#shared/utils/ledger'

// The authoritative total for a basket, recomputed from live prices rather than trusted from the
// screen (0004, F-103 criterion 3). Refuses a line the till cannot sell right now, by name.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, basketForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  return priceBasket(input.lines, londonDayOf(new Date()))
})
