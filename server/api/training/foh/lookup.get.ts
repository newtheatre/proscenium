import { z } from 'zod'
import { findTrainingBookings, trainingPerformance } from '~~/shared/utils/trainingScenario'

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
})

/**
 * GET /api/training/foh/lookup: searches the fixture and nothing else, so a
 * real reference typed in here finds nothing (docs/14 §4).
 */
export default defineEventHandler(async (event) => {
  const { run } = await requireRun(event, 'door-scan')
  const { q } = await getValidatedQuery(event, querySchema.parse)

  const matches = findTrainingBookings(q)
  await recordEvent(run.id, 'LOOKUP', { query: q, matches: matches.length })

  return matches.map((booking) => {
    const standing = bookingStanding(booking)
    const performance = trainingPerformance(booking.performanceId)

    return {
      id: booking.id,
      bookingRef: booking.bookingRef,
      status: booking.status,
      performance: performance
        ? {
            id: performance.id,
            startsAt: performance.startsAt,
            showTitle: performance.showTitle,
            venueName: performance.venueName,
          }
        : null,
      standing: { state: standing.state, partySize: standing.partySize },
      firstName: booking.customerName.split(' ')[0] ?? '',
      accessNeeds: booking.accessNeeds,
      alreadyAdmitted: booking.admitted,
    }
  })
})
