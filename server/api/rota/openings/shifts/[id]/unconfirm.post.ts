import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { openingUnconfirmRefusal } from '#shared/utils/rota-openings'

// Take somebody off a slot of a bar opening without releasing them from the evening themselves:
// the slot returns to open naming nobody, and they are told (E-107, E-130 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const held = await openingShiftDetail(id)
  if (!held) throw noSuch('bar opening slot')

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar-opening-shift.unconfirmed',
    target: `bar-opening-shift:${id}`,
    detail: changes({ userId: [held.userId, null], status: [held.status, 'OPEN'] }),
  })

  const applied = await withOpeningConstraints(() =>
    auditedWrite(db.all<{ id: string }>(unconfirmOpeningShiftStatement(id)), entry))

  if (!applied) {
    const now = await openingShiftDetail(id)
    throw createError({ statusCode: 409, statusMessage: openingUnconfirmRefusal(now?.status ?? held.status) })
  }

  if (held.userId) {
    await notify(event, {
      userId: held.userId,
      type: 'shift.removed',
      context: {
        name: '',
        show: held.label,
        venue: held.venueName,
        when: formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        role: 'bar',
      },
    })
  }

  return { ok: true, status: 'OPEN' }
})
