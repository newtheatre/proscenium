import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { approvalRefusal, saysShiftRole } from '#shared/utils/rota'

// Approve a queued claim. The status and the training gate both ride the write, so two officers
// confirm it once and a lapsed claimant is never confirmed (E-105 criteria 2 and 3, 0003).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const held = await shiftDetail(id)
  if (!held) throw noSuch('shift')

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'shift.confirmed',
    target: `shift:${id}`,
    detail: changes({ status: [held.status, 'CONFIRMED'] }),
  })

  const moduleId = (await shiftRoleRules(event))[held.role]
  const statement = approveShiftStatement(id, { moduleId, today: londonToday() })
  const applied = await withShiftConstraints(() => auditedWrite(db.all<{ id: string }>(statement), entry))

  if (!applied) {
    const now = await shiftDetail(id)
    if (now?.status === 'CLAIMED' && now.userId) throw await lapsedClaimRefusal(now.role, now.userId, moduleId)
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
