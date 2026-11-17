// One membership for its console page (tab 5, "A membership"): the person, the scheme, the dates,
// the derived status, how it started and ended, and every check made on it.
import { getRouterParam } from 'h3'
import { all, defineRoute, first, refuse } from '#kit'
import { accountLabel } from '#modules/core'
import { derivedStatus } from '../../../dates'
import { memberNumber, todayOrNull } from '../../../memberships'

export default defineRoute({
  ability: 'membership.membership.view',
  record: event => ['membership.membership', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const m = await first<{ id: string, accountId: string, schemeId: string, schemeName: string, side: string, graceDays: number, holderMayEnd: number, state: string, origin: string, lengthName: string | null, startsOn: string | null, endsOn: string | null, activatedAt: number | null, endedAt: number | null, endReason: string | null, note: string | null, createdAt: number }>(
    `SELECT m.id, m.account_id AS accountId, m.scheme_id AS schemeId, s.name AS schemeName, s.side, s.grace_days AS graceDays, s.holder_may_end AS holderMayEnd,
            m.state, m.origin, o.name AS lengthName, m.starts_on AS startsOn, m.ends_on AS endsOn, m.activated_at AS activatedAt, m.ended_at AS endedAt,
            m.end_reason AS endReason, m.note, m.created_at AS createdAt
       FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id LEFT JOIN membership_length_options o ON o.id = m.length_option_id
      WHERE m.id = ?`,
    record!.id,
  )
  if (!m) refuse('core.not-found', 'There is no such membership.', { status: 404 })
  const day = await todayOrNull()
  const checks = await all<{ verifier: string, outcome: string, reason: string | null, note: string | null, decidedBy: string | null, createdAt: number }>(
    'SELECT verifier, outcome, reason, note, decided_by AS decidedBy, created_at AS createdAt FROM membership_verifications WHERE membership_id = ? ORDER BY created_at, id',
    m!.id,
  )
  const status = m!.state !== 'active' ? m!.state : day ? derivedStatus({ startsOn: m!.startsOn!, endsOn: m!.endsOn }, m!.graceDays, day) : 'upcoming'
  return {
    membership: { ...m, holderMayEnd: !!m!.holderMayEnd, status, name: await accountLabel(m!.accountId) },
    number: (await memberNumber(m!.accountId))?.label ?? null,
    checks: await Promise.all(checks.map(async c => ({ ...c, decidedBy: c.decidedBy ? await accountLabel(c.decidedBy) : null }))),
  }
})
