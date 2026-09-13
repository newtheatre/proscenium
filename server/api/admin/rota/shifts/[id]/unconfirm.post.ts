import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { saysShiftRole, unconfirmRefusal } from '#shared/utils/rota'

// Stands a confirmed shift down to open, an officer's call rather than the holder's own release
// (E-107, issue 933): whoever held it is told, and keeps no claim on the performance.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const held = await shiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such shift' })

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'shift.unconfirmed',
    target: `shift:${id}`,
    detail: changes({ userId: [held.userId, null], status: [held.status, 'OPEN'] }),
  })

  const applied = await withShiftConstraints(() => auditedWrite(db.all<{ id: string }>(unconfirmShiftStatement(id)), entry))

  if (!applied) {
    const now = await shiftDetail(id)
    throw createError({ statusCode: 409, statusMessage: unconfirmRefusal(now?.status ?? held.status) })
  }

  if (held.userId) {
    const when = formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
    await notify(event, {
      userId: held.userId,
      type: 'shift.removed',
      context: { name: '', show: held.showTitle, venue: held.venueName, when, role: saysShiftRole(held.role).toLowerCase() },
    })
  }

  return { ok: true, status: 'OPEN' }
})
