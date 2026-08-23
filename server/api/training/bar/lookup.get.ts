import { z } from 'zod'
import { findTrainingBookings, trainingPerformance } from '~~/shared/utils/trainingScenario'

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
})

/** GET /api/training/bar/lookup: the fixture, shaped as the till expects. */
export default defineEventHandler(async (event) => {
  const { run } = await requireRun(event, 'bar-till')
  const { q } = await getValidatedQuery(event, querySchema.parse)

  const matches = findTrainingBookings(q)
  await recordEvent(run.id, 'LOOKUP', { query: q, matches: matches.length })

  return matches.map((booking) => {
    const standing = bookingStanding(booking)
    const performance = trainingPerformance(booking.performanceId)

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
        isTonight: true,
      },
    }
  })
})
