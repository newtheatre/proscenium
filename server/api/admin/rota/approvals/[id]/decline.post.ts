import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { approvalRefusal, saysShiftRole, shiftDeclineForm } from '#shared/utils/rota'

// Decline a queued claim with a reason the claimant sees. The reason lives on the row; the
// audit trail carries only that the status changed (E-105 criteria 2 and 3, 0011).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')
  const { reason } = await readValidatedBodyOrThrow(event, shiftDeclineForm)

  const held = await shiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such shift' })

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'shift.declined',
    target: `shift:${id}`,
    detail: changes({ status: [held.status, 'DECLINED'] }),
  })

  const [declined] = await withShiftConstraints(() => db.batch([
    db.all<{ id: string }>(declineShiftStatement(id, reason)),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
  ]))

  if (declined.length === 0) {
    const now = await shiftDetail(id)
    throw createError({ statusCode: 409, statusMessage: approvalRefusal(now?.status ?? held.status) })
  }

  if (held.userId) {
    await notify(event, {
      userId: held.userId,
      type: 'shift.declined',
      context: {
        name: '',
        show: held.showTitle,
        venue: held.venueName,
        when: formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        role: saysShiftRole(held.role).toLowerCase(),
        reason,
      },
    })
  }

  return { ok: true, status: 'DECLINED' }
})
