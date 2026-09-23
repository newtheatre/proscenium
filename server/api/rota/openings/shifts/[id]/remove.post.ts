import { changes } from '#shared/utils/audit'
import { openingSlotRemoveRefusal } from '#shared/utils/rota-openings'

// Take an open slot off a planned opening. A slot somebody holds is stood down first, as the
// rota offers no way to remove a held shift (E-130 criterion 7).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const held = await openingShiftDetail(id)
  if (!held) throw noSuch('bar opening slot')

  // The opening is the target, because the slot's own row is what goes.
  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar-opening-shift.removed',
    target: `bar-opening:${held.openingId}`,
    detail: changes({ slot: [held.slot, null] }),
  })

  const applied = await auditedWrite(db.all<{ id: string }>(removeOpeningShiftStatement(id)), entry)
  if (!applied) {
    const now = await openingShiftDetail(id)
    const remaining = await openingSlotsRemaining(held.openingId)
    throw createError({ statusCode: 409, statusMessage: openingSlotRemoveRefusal(now, remaining) })
  }

  return { ok: true }
})
