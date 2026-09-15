import { formatLondon } from '#shared/utils/london'
import { COMMITTED_SHIFT_STATUSES } from '#shared/utils/rota'
import { openingCancelRefusal } from '#shared/utils/rota-openings'

// Cancel a bar opening. Its slots go with it, whoever held one keeps their name on it and is
// told, and an unclaimed one still names nobody (E-130 criterion 5).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const held = await openingDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such bar opening' })
  if (held.status === 'CANCELLED') throw createError({ statusCode: 409, statusMessage: openingCancelRefusal(held.status) })

  // Read before the write, because the cancellation is what takes the status away.
  const active = await activeOpeningShifts(id)
  const holders = active.filter(slot => COMMITTED_SHIFT_STATUSES.includes(slot.status) && slot.userId !== null)

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar-opening.cancelled',
    target: `bar-opening:${id}`,
    detail: { venueId: held.venueId, night: held.night, shiftsCancelled: active.length },
  })

  // The predicate rides the UPDATE and the entry rides `changes()`, so two officers cancelling at
  // once write one cancellation and one audit row (0003). The slots go in the same batch (E-130).
  const applied = await auditedWrite(
    db.all<{ id: string }>(cancelOpeningStatement(id)),
    entry,
    db.run(cancelOpeningShiftsStatement(id)),
  )
  if (!applied) throw createError({ statusCode: 409, statusMessage: openingCancelRefusal('CANCELLED') })

  // The bar is not opening, so no shift preference can silence this: somebody would turn up.
  const when = formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
  for (const holder of holders) {
    // The write is idempotent and the read before it is not, so two officers cancelling at once
    // would otherwise tell every holder twice. The claim is what makes the send at most once.
    const key = `shift.opening-cancelled:${holder.slotId}`
    const took = await claimNotification({ userId: holder.userId!, type: 'shift.opening-cancelled', key })
    if (!took) continue

    await notify(event, {
      userId: holder.userId!,
      type: 'shift.opening-cancelled',
      claim: key,
      context: { name: '', show: held.label, venue: held.venueName, when },
    })
  }

  return { ok: true, status: 'CANCELLED', shiftsCancelled: active.length }
})
