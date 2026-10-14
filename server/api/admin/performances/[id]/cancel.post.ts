import { formatLondon } from '#shared/utils/london'
import { performanceCancelForm } from '#shared/utils/programme'
import { COMMITTED_SHIFT_STATUSES, saysShiftRole } from '#shared/utils/rota'

// Cancel a performance: the only way out for one that has sold seats. Every holder is told, with the
// officer's reason, and refunds stay in person at the desk (D-121 criterion 5, D-116 criterion 1).
const ALREADY_CANCELLED = 'This performance is already cancelled'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')
  const { reason } = await readValidatedBodyOrThrow(event, performanceCancelForm)

  const held = await performanceById(id)
  if (!held) throw noSuch('performance')
  if (held.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: ALREADY_CANCELLED })
  }

  // Read before the write, because the cancellation is what takes the status away.
  const active = await activeShifts(id)
  const bookings = await db.all<{ reservationId: string, reference: string, userId: string, collected: number }>(cancelledPerformanceHoldersQuery(id))
  // An open slot has nobody to tell; a claimed one is owed the same word a confirmed one is,
  // because it is what the delete route's own refusal promises (E-102 criterion 4).
  const holders = active.filter(shift => COMMITTED_SHIFT_STATUSES.includes(shift.status) && shift.userId !== null)

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'performance.cancelled',
    target: `performance:${id}`,
    detail: {
      showId: held.showId,
      night: performanceNight(held.startsAt),
      // Counted from the tables that reference the performance, so it is nought only while no
      // such table exists (D-121 criterion 5).
      ticketsOwedARefund: held.soldTickets,
      shiftsCancelled: active.length,
      bookingsTold: bookings.length,
    },
  })

  // The predicate rides the UPDATE and the audit rides its `changes()`, so two officers cancelling
  // at once write one cancellation and one audit entry, and the second is told so (0003, 0049).
  const [cancelled] = await db.batch([
    db.all<{ id: string }>(cancelPerformanceStatement(id)),
    db.run(auditIfChanged(entry)),
    // The rota goes with the performance, in the same batch (E-102 criterion 4).
    db.run(cancelShiftsStatement(id)),
  ])
  if (cancelled.length === 0) throw createError({ statusCode: 409, statusMessage: ALREADY_CANCELLED })

  // The show is off, so a shift preference cannot silence this: somebody would otherwise turn up.
  const when = formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
  for (const holder of holders) {
    // The write is idempotent and the read before it is not, so two officers cancelling at once
    // would otherwise tell every holder twice. The claim is what makes the send at most once.
    const key = `shift.performance-cancelled:${holder.shiftId}`
    const took = await claimNotification({
      userId: holder.userId!,
      type: 'shift.performance-cancelled',
      key,
    })
    if (!took) continue

    await notify(event, {
      userId: holder.userId!,
      type: 'shift.performance-cancelled',
      claim: key,
      context: {
        name: '',
        show: held.showTitle,
        venue: held.venueName,
        when,
        role: saysShiftRole(holder.role).toLowerCase(),
      },
    })
  }

  // The reason is the officer's free text, so it goes to the holders and never into the audit (0011).
  for (const booking of bookings) {
    const key = `reservation.performance-cancelled:${booking.reservationId}`
    const took = await claimNotification({ userId: booking.userId, type: 'reservation.performance-cancelled', key })
    if (!took) continue

    await notify(event, {
      userId: booking.userId,
      type: 'reservation.performance-cancelled',
      claim: key,
      context: {
        name: '',
        reference: booking.reference,
        show: held.showTitle,
        when,
        collected: booking.collected === 1,
        reason,
      },
    })
  }

  return {
    ok: true,
    status: 'CANCELLED',
    night: performanceNight(held.startsAt),
    ticketsOwedARefund: held.soldTickets,
    shiftsCancelled: active.length,
    bookingsTold: bookings.length,
  }
})
