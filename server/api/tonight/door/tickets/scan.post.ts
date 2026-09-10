import { doorTicketOutcome, doorTicketScanForm } from '#shared/utils/reservations'
import { formatLondon } from '#shared/utils/london'
import { saysPrice } from '#shared/utils/ticket-types'

// Scan an ordinary ticket at the door (E-127 criterion 3, D-108 criterion 5): admits it for the
// performance chosen here, or refuses loudly, naming the performance it is really for.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, doorTicketScanForm)
  const resolved = await requireNightAuthority(event, 'DOOR', { performanceId: input.performanceId })

  const reservation = await reservationForDoor(input.reference)
  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'No such booking' })

  const outcome = doorTicketOutcome(
    reservation.status,
    reservation.cancelledBy,
    reservation.performanceId,
    input.performanceId,
    reservation.showTitle,
    formatLondon(new Date(reservation.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
    reservation.status === 'PENDING' ? saysPrice(reservation.totalPence) : null,
  )

  if (!outcome.admit) throw createError({ statusCode: 409, statusMessage: outcome.detail ?? outcome.headline })

  const admitted = await admitAtDoor(reservation.id, resolved.account.id)
  if (!admitted) throw createError({ statusCode: 409, statusMessage: 'This booking has already been admitted tonight' })

  return { decision: 'ADMIT' as const, showTitle: reservation.showTitle }
})
