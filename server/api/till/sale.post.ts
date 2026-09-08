import { saysMoney } from '#shared/utils/bar'
import { londonDayOf } from '#shared/utils/ledger'
import { saleForm } from '#shared/utils/sale'

// The submission boundary (F-104): refuses a total that disagrees with the screen's, quoting
// both, rather than charging whatever the caller sent (0004, 0005). Writes nothing either way.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, saleForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const priced = await priceBasket(input.lines, londonDayOf(new Date()))
  if (priced.totalPence !== input.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen said ${saysMoney(input.expectedTotalPence)}; the till now reads ${saysMoney(priced.totalPence)}. Nothing has been charged: check the basket and try again.`,
    })
  }

  return { ok: true, ...priced }
})
