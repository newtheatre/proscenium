import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { approvalRefusal, shiftDeclineForm } from '#shared/utils/rota'

// Decline a queued claim on a bar opening with a reason the claimant sees. The reason lives on
// the row; the audit trail carries only that the status changed (E-105 criterion 3, 0011).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')
  const { reason } = await readValidatedBodyOrThrow(event, shiftDeclineForm)

  const held = await openingShiftDetail(id)
  if (!held) throw noSuch('bar opening slot')

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar-opening-shift.declined',
    target: `bar-opening-shift:${id}`,
    detail: changes({ status: [held.status, 'DECLINED'] }),
  })

  const applied = await withOpeningConstraints(() =>
    auditedWrite(db.all<{ id: string }>(declineOpeningShiftStatement(id, reason)), entry))

  if (!applied) {
    const now = await openingShiftDetail(id)
    throw createError({ statusCode: 409, statusMessage: approvalRefusal(now?.status ?? held.status) })
  }

  if (held.userId) {
    await notify(event, {
      userId: held.userId,
      type: 'shift.declined',
      context: {
        name: '',
        show: held.label,
        venue: held.venueName,
        when: formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        role: 'bar',
        reason,
      },
    })
  }

  return { ok: true, status: 'DECLINED' }
})
