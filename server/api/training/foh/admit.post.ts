import { z } from 'zod'
import { trainingBooking } from '~~/shared/utils/trainingScenario'

const bodySchema = z.object({
  reservationId: z.string().trim().min(1),
})

/** POST /api/training/foh/admit: practise recording an admission. */
export default defineEventHandler(async (event) => {
  const { run } = await requireRun(event, 'door-scan')
  const { reservationId } = await readValidatedBody(event, bodySchema.parse)

  const booking = trainingBooking(reservationId)
  if (!booking) throw createError({ statusCode: 404, statusMessage: 'No such booking.' })

  const standing = bookingStanding(booking)

  // Payment and admission are separate states for real, and confusing them is
  // the mistake this screen actually produces (docs/14 §5.3).
  if (standing.state === 'CANCELLED' || standing.state === 'NO_SHOW') {
    throw createError({ statusCode: 409, statusMessage: 'That booking is not live. Send them to the counter.' })
  }

  await recordEvent(run.id, 'ADMISSION', {
    bookingRef: booking.bookingRef,
    partySize: standing.partySize,
    state: standing.state,
  })

  return { admitted: standing.partySize, state: standing.state }
})
