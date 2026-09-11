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
    reservation.exchangedToShowTitle && reservation.exchangedToStartsAt
      ? { showTitle: reservation.exchangedToShowTitle, when: formatLondon(new Date(reservation.exchangedToStartsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }) }
      : null,
  )

  // The door's own card reads `data`; the message is unchanged, so the desk still gets the
  // amount due while the screen shows the wording (E-129 criterion 7).
  const party = await doorParty(reservation.id)
  const unpaid = reservation.status === 'PENDING' && reservation.performanceId === input.performanceId

  if (!outcome.admit) {
    throw createError({
      statusCode: 409,
      statusMessage: outcome.detail ?? outcome.headline,
      data: { verdict: doorVerdict(outcome, unpaid), reference: reservation.reference, ...party },
    })
  }

  const admitted = await admitAtDoor(reservation.id, resolved.account.id)
  if (!admitted) throw createError({ statusCode: 409, statusMessage: 'This booking has already been admitted tonight' })

  return {
    decision: 'ADMIT' as const,
    showTitle: reservation.showTitle,
    reference: reservation.reference,
    verdict: doorVerdict(outcome, false),
    ...party,
  }
})
