import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { saysShiftRole } from '#shared/utils/rota'

// Claim an open shift in one tap. Eligibility is re-checked live and availability rides the
// write, so a stale list cannot claim past a training gate or a taken slot (E-104).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const account = await requireAccount(event)

  const held = await shiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such shift' })

  const eligibilities = await shiftEligibilities(event, account.id, londonToday())
  if (!eligibilities[held.role].eligible) {
    throw createError({
      statusCode: 403,
      statusMessage: `You do not currently qualify for a ${saysShiftRole(held.role).toLowerCase()} shift`,
    })
  }

  const autoConfirm = await configValue(event, 'SHIFT_CLAIM_AUTO_CONFIRM')
  const status = autoConfirm ? 'CONFIRMED' : 'CLAIMED'

  const entry = auditEntry({
    actorId: account.id,
    action: 'shift.claimed',
    target: `shift:${id}`,
    detail: changes({ status: [held.status, status] }),
  })

  const [claimed] = await withShiftConstraints(() => db.batch([
    db.all<{ id: string }>(claimShiftStatement(id, account.id, status)),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
  ]))

  if (claimed.length === 0) {
    const now = await shiftDetail(id)
    if (!now) throw createError({ statusCode: 404, statusMessage: 'No such shift' })
    if (now.status !== 'OPEN') throw createError({ statusCode: 409, statusMessage: 'That shift has already been taken' })
    throw createError({ statusCode: 409, statusMessage: 'You already hold a shift on this performance' })
  }

  return { ok: true, status }
})
