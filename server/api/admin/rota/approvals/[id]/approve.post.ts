import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { approvalRefusal, saysShiftRole } from '#shared/utils/rota'

// Approve a queued claim. The predicate rides the write, so two officers deciding at once
// confirm it once between them (E-105 criteria 2 and 3, 0003).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const held = await shiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such shift' })

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'shift.confirmed',
    target: `shift:${id}`,
    detail: changes({ status: [held.status, 'CONFIRMED'] }),
  })

  const applied = await withShiftConstraints(() => auditedWrite(db.all<{ id: string }>(approveShiftStatement(id)), entry))

  if (!applied) {
    const now = await shiftDetail(id)
    throw createError({ statusCode: 409, statusMessage: approvalRefusal(now?.status ?? held.status) })
  }

  if (held.userId) {
    await notify(event, {
      userId: held.userId,
      type: 'shift.approved',
      context: {
        name: '',
        show: held.showTitle,
        venue: held.venueName,
        when: formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        role: saysShiftRole(held.role).toLowerCase(),
      },
    })
  }

  return { ok: true, status: 'CONFIRMED' }
})
