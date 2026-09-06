import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { releaseRefusal, saysShiftRole } from '#shared/utils/rota'
import { showNightBounds } from '#shared/utils/show-night'

// Release a shift you hold, back to OPEN, up to the start of its show night (E-107 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const account = await requireAccount(event)

  const held = await shiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such shift' })
  if (held.status !== 'CLAIMED' && held.status !== 'CONFIRMED') {
    throw createError({ statusCode: 409, statusMessage: releaseRefusal(held.status) })
  }
  if (held.userId !== account.id) throw createError({ statusCode: 403, statusMessage: 'That is not your shift to release' })

  // Authority itself expires at 04:00 (E-111), and release is the same boundary: past it the
  // shift is the night's business, not a change a holder can still make from home.
  const cutoff = showNightBounds(performanceNight(held.startsAt)).from.getTime()
  if (Date.now() >= cutoff) {
    throw createError({ statusCode: 409, statusMessage: 'That show night has already begun, so the shift can no longer be released' })
  }

  const entry = auditEntry({
    actorId: account.id,
    action: 'shift.released',
    target: `shift:${id}`,
    detail: changes({ status: [held.status, 'OPEN'] }),
  })

  const [released] = await withShiftConstraints(() => db.batch([
    db.all<{ id: string }>(releaseShiftStatement(id, account.id)),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
  ]))

  if (released.length === 0) {
    const now = await shiftDetail(id)
    // Still held, by somebody else: an officer's reassignment landed in the gap, which
    // `releaseRefusal` has no wording for because it only ever expects the caller's own status.
    if (now && now.userId !== account.id && (now.status === 'CLAIMED' || now.status === 'CONFIRMED')) {
      throw createError({ statusCode: 409, statusMessage: 'This shift has been reassigned since you opened this page' })
    }
    throw createError({ statusCode: 409, statusMessage: releaseRefusal(now?.status ?? held.status) })
  }

  // Close to the night, or a duty manager gone at all: both reach the FOH officer now rather
  // than waiting for tomorrow's seven-day digest (E-107 criterion 2).
  const noticeHours = await configValue(event, 'SHIFT_RELEASE_NOTICE_HOURS')
  const hoursUntil = (held.startsAt * 1000 - Date.now()) / 3_600_000
  if (held.role === 'DUTY_MANAGER' || hoursUntil <= noticeHours) {
    const officers = await rotaOfficers()
    const when = formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
    await Promise.all(officers.map(officer => notify(event, {
      userId: officer.id,
      type: 'shift.released',
      context: { name: '', show: held.showTitle, venue: held.venueName, when, role: saysShiftRole(held.role).toLowerCase() },
    })))
  }

  return { ok: true, status: 'OPEN' }
})
