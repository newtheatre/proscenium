import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { approvalRefusal } from '#shared/utils/rota'

// Approve a queued claim on a bar opening. The status and the bar gate both ride the write, so
// two officers confirm it once and a lapsed claimant never (E-130 criterion 3, E-105, 0003).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')

  const held = await openingShiftDetail(id)
  if (!held) throw noSuch('bar opening slot')

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar-opening-shift.confirmed',
    target: `bar-opening-shift:${id}`,
    detail: changes({ status: [held.status, 'CONFIRMED'] }),
  })

  const moduleId = (await shiftRoleRules(event)).BAR
  const statement = approveOpeningShiftStatement(id, { moduleId, today: londonToday() })
  const applied = await withOpeningConstraints(() => auditedWrite(db.all<{ id: string }>(statement), entry))

  if (!applied) {
    const now = await openingShiftDetail(id)
    if (now?.status === 'CLAIMED' && now.userId) throw await lapsedClaimRefusal('BAR', now.userId, moduleId)
    throw createError({ statusCode: 409, statusMessage: approvalRefusal(now?.status ?? held.status) })
  }

  if (held.userId) {
    await notify(event, {
      userId: held.userId,
      type: 'shift.approved',
      context: {
        name: '',
        show: held.label,
        venue: held.venueName,
        when: formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        role: 'bar',
      },
    })
  }

  return { ok: true, status: 'CONFIRMED' }
})
