import { doorStatusAt, doorTicketOutcome, doorTicketScanForm, nothingToCollect } from '#shared/utils/reservations'
import { firstNameOf } from '#shared/utils/night-hub'
import { formatLondon } from '#shared/utils/london'
import { saysPrice } from '#shared/utils/ticket-types'

// Scan an ordinary ticket at the door (E-127 criterion 3, D-108 criterion 5): admits it for the
// performance chosen here, or refuses loudly, naming the performance it is really for.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, doorTicketScanForm)
  const resolved = await requireNightAuthority(event, 'DOOR', { performanceId: input.performanceId })

  const reservation = await reservationForDoor(input.reference)
  if (!reservation) throw noSuch('booking', 'Check the reference and try again')

  const status = doorStatusAt(reservation.status, reservation.holdExpiresAt, Math.floor(Date.now() / 1000))
  const outcome = doorTicketOutcome(
    status,
    reservation.cancelledBy,
    reservation.performanceId,
    input.performanceId,
    reservation.showTitle,
    formatLondon(new Date(reservation.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
    status === 'PENDING' ? saysPrice(reservation.totalPence) : null,
    reservation.exchangedToShowTitle && reservation.exchangedToStartsAt
      ? { showTitle: reservation.exchangedToShowTitle, when: formatLondon(new Date(reservation.exchangedToStartsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }) }
      : null,
    reservation.admittedAt,
    nothingToCollect(reservation.holdExpiresAt, reservation.totalPence),
  )

  // Tonight's own booking only: the agreed wording is for the person in front of the door (D-128 4).
  // A first name only, as door mode shows it, so the full name never rides the response (E-129 7).
  const [party, accessWording] = await Promise.all([
    doorParty(reservation.id).then(row => ({ ...row, holderName: firstNameOf(row.holderName) })),
    reservation.performanceId === input.performanceId ? doorAccessWording(reservation.id) : null,
  ])
  // The door's own card reads `data`; the message is unchanged, so the desk still gets the
  // amount due while the screen shows the wording (E-129 criterion 7).
  const unpaid = status === 'PENDING' && reservation.performanceId === input.performanceId

  if (!outcome.admit) {
    throw createError({
      statusCode: 409,
      statusMessage: outcome.detail ?? outcome.headline,
      data: { verdict: doorVerdict(outcome, unpaid), reference: reservation.reference, ...party, accessWording },
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
    accessWording,
  }
})
