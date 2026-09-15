import { compRequestForm } from '#shared/utils/comps'
import { londonDayOf } from '#shared/utils/ledger'

// Ask for a comp: open to any bar-authorised till user, since nothing moves until it is approved
// (F-110 criterion 1). The basket is priced live so the request answers with what it would cost.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, compRequestForm)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })

  // Refuses an unsellable line by name before a request is ever raised over it, the same cross-
  // check a priced basket always gets (F-103 criterion 3).
  const priced = await priceBasket(input.lines, londonDayOf(new Date()), null)

  // The house the ask was made at, resolved from the bar's own windows exactly as a sale is, so
  // an approved comp reports against the performance it was served to (F-126 criterion 4).
  const performanceId = await performanceForSale({
    venueId: resolved.venueId,
    night: resolved.night,
    performanceId: null,
    performanceIds: resolved.performanceIds,
    event,
  }, Math.floor(Date.now() / 1000))

  const id = await createCompRequest(resolved.account.id, resolved.venueId, resolved.night, input.reason, input.lines, performanceId)

  return { ok: true, id, priced }
})
