import { z } from 'zod'
import { findTrainingBookings, trainingPerformance } from '~~/shared/utils/trainingScenario'
import { isStaff } from '~~/shared/utils/abilities'

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
})

/**
 * GET /api/training/foh/lookup: searches the fixture and nothing else, so a
 * real reference typed in here finds nothing (docs/14 §4).
 */
export default defineEventHandler(async (event) => {
  const { run, user } = await requireRun(event, 'door-scan')
  const { q } = await getValidatedQuery(event, querySchema.parse)

  const matches = findTrainingBookings(q)
  await recordEvent(run.id, 'LOOKUP', { query: q, matches: matches.length })

  // The same role branch as the real lookup: the door gets a verdict and a
  // head count, never money, and only staff see a customer's details.
  const staff = isStaff(user)

  return matches.map((booking) => {
    const standing = bookingStanding(booking)
    const performance = trainingPerformance(booking.performanceId)
    const firstName = booking.customerName.split(' ')[0] ?? ''

    const base = {
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
      accessNeeds: booking.accessNeeds,
    }

    if (!staff) {
      return {
        ...base,
        standing: { state: standing.state, partySize: standing.partySize },
        firstName,
      }
    }

    return {
      ...base,
      standing,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      tickets: booking.tickets.map(ticket => ({
        pricePaid: ticket.pricePaid,
        refundedAt: ticket.refundedAt,
        ticketTypeName: ticket.ticketTypeName,
      })),
    }
  })
})
