import { z } from 'zod'
import { findTrainingBookings } from '~~/shared/utils/trainingScenario'

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
})

/** GET /api/training/bar/lookup: the fixture, shaped as the till expects. */
export default defineEventHandler(async (event) => {
  const { run } = await requireRun(event, 'bar-till')
  const { q } = await getValidatedQuery(event, querySchema.parse)

  // The real till lookup excludes cancelled bookings, so this must too, or a
  // trainee is taught to take money for one.
  const matches = findTrainingBookings(q).filter(booking => booking.status !== 'CANCELLED')
  await recordEvent(run.id, 'LOOKUP', { query: q, matches: matches.length })

  // Not night-scoped, like the real till: paying in advance for next week is a
  // designed case (docs/13 §2.2), and one fixture booking is exactly that.
  const dated = new Map(scenarioTonight().performances.map(performance => [performance.id, performance]))

  return matches.map((booking) => {
    const standing = bookingStanding(booking)
    const performance = dated.get(booking.performanceId)

    return {
      id: booking.id,
      bookingRef: booking.bookingRef,
      firstName: booking.customerName.split(' ')[0] ?? '',
      amountOwedPence: standing.amountOwedPence,
      alreadyPaid: standing.state === 'PAID',
      performance: {
        showTitle: performance?.showTitle ?? 'Practice',
        startsAt: performance?.startsAt ?? new Date().toISOString(),
        venueName: performance?.venueName ?? 'Practice House',
        // An unknown performance flags rather than asserts: the amber card is
        // the safe answer, and it is still payable.
        isTonight: performance?.isTonight ?? false,
      },
    }
  })
})
