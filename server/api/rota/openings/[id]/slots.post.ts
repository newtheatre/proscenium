import { changes } from '#shared/utils/audit'

// One more bar slot on a planned opening, a one-off that leaves the venue's template alone
// (E-130 criterion 7, 0077).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const held = await openingDetail(id)
  if (!held) throw noSuch('bar opening')
  if (held.status === 'CANCELLED') throw createError({ statusCode: 409, statusMessage: 'This opening has been cancelled' })

  const slotId = newId()
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar-opening-shift.added',
    target: `bar-opening:${id}`,
    // The number is the write's to choose, so the audit statement fills it in from the row.
    detail: changes({ slotId: [null, slotId], slot: [null, null] }),
  })

  // Conditional on the opening still being planned, so a cancellation landing first adds nothing.
  const [added] = await withOpeningConstraints(() => db.batch([
    db.all<{ id: string, slot: number }>(addOpeningShiftStatement(slotId, id)),
    db.run(addedSlotAuditStatement(entry, slotId)),
  ]))
  if (added.length === 0) throw createError({ statusCode: 409, statusMessage: 'This opening has been cancelled' })

  return { ok: true, slotId, slot: added[0]!.slot }
})
