import { z } from 'zod'
import { tillScopeForm } from '#shared/utils/till'

const query = tillScopeForm.extend({ q: z.string().trim().min(2, 'Type at least two characters').max(200) })

// The Tickets tab's lookup (F-122 criterion 1): a reference finds the booking wherever it is, a
// name searches tonight's houses at this venue. Guarded exactly as a sale is.
export default defineEventHandler(async (event) => {
  const input = await getValidatedQueryOrThrow(event, query)
  const resolved = await requireNightAuthority(event, 'BAR', { venueId: input.venueId, performanceId: input.performanceId })
  requireOpenSession(await openSessionFor(resolved.venueId, resolved.night))

  return { bookings: await findTillBookings(input.q, resolved.performanceIds) }
})
