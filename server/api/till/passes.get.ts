import { z } from 'zod'
import { tillScopeForm } from '#shared/utils/till'

const query = tillScopeForm.extend({ performanceId: z.string().trim().min(1, 'Say which performance you mean') })

// What the till may sell as a pass tonight (D-134): each on sale today covering this house's show,
// with its price points. The buyer is named at the sale, never listed here.
export default defineEventHandler(async (event) => {
  const input = await getValidatedQueryOrThrow(event, query)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  const performance = await performanceById(input.performanceId)
  if (!performance) throw noSuch('performance')

  return { performanceId: input.performanceId, passes: await passOffers(performance.showId, null, Math.floor(Date.now() / 1000)) }
})
