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
    detail: changes({ slotId: [null, slotId] }),
  })

  // Conditional on the opening still being planned, so a cancellation landing first adds nothing.
  const applied = await withOpeningConstraints(() =>
    auditedWrite(db.all<{ id: string }>(addOpeningShiftStatement(slotId, id)), entry))
  if (!applied) throw createError({ statusCode: 409, statusMessage: 'This opening has been cancelled' })

  const added = await openingShiftDetail(slotId)
  return { ok: true, slotId, slot: added?.slot ?? null }
})
