import { sql } from 'drizzle-orm'
import { formatLondon } from '#shared/utils/london'
import { COMMITTED_SHIFT_STATUSES, saysShiftRole } from '#shared/utils/rota'

// Cancel a performance. This is the only way out for one that has sold seats, and the count it
// returns is what the refund workflow (D-116) and the holder notification (D-107) will act on.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await performanceById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such performance' })
  if (held.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'This performance is already cancelled' })
  }

  // Read before the write, because the cancellation is what takes the status away.
  const active = await activeShifts(id)
  // An open slot has nobody to tell; a claimed one is owed the same word a confirmed one is,
  // because it is what the delete route's own refusal promises (E-102 criterion 4).
  const holders = active.filter(shift => COMMITTED_SHIFT_STATUSES.includes(shift.status) && shift.userId !== null)

  // The predicate rides the UPDATE, so two officers cancelling at once write one cancellation and
  // one audit entry rather than two (0003).
  await db.batch([
    db.run(sql`UPDATE performances SET status = 'CANCELLED', updated_at = unixepoch() WHERE id = ${id} AND status <> 'CANCELLED'`),
    // The rota goes with the performance, in the same batch (E-102 criterion 4).
    db.run(cancelShiftsStatement(id)),
    db.insert(schema.auditLog).values(auditEntry({
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
      },
    })),
  ])

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

  return { ok: true, status: 'CANCELLED', ticketsOwedARefund: held.soldTickets, shiftsCancelled: active.length }
})
