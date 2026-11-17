// The caller's own memberships for My membership (MEM-33): each with its scheme, dates and derived
// status, their member number, and their open applications with what each is waiting on. Ended,
// declined and expired rows are left to a later slice.
import { all, defineRoute } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { derivedStatus } from '../../dates'
import { memberNumber, todayOrNull } from '../../memberships'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const accountId = actor.accountId!
  const day = await todayOrNull()
  const rows = await all<{ id: string, scheme_id: string, scheme_name: string, side: 'members' | 'audience', starts_on: string, ends_on: string | null, grace_days: number, option_name: string | null, holder_may_end: number }>(
    `SELECT m.id, m.scheme_id, s.name AS scheme_name, s.side, m.starts_on, m.ends_on, s.grace_days, o.name AS option_name, s.holder_may_end
       FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id
       LEFT JOIN membership_length_options o ON o.id = m.length_option_id
      WHERE m.account_id IN (${accountScopeSql('?1')}) AND m.state = 'active'
      ORDER BY m.starts_on DESC, m.id`,
    accountId,
  )
  const pending = await all<{ id: string, schemeId: string, schemeName: string, appliedAt: number }>(
    `SELECT m.id, m.scheme_id AS schemeId, s.name AS schemeName, m.created_at AS appliedAt FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id
      WHERE m.account_id IN (${accountScopeSql('?1')}) AND m.state = 'pending' ORDER BY m.created_at`,
    accountId,
  )
  return {
    number: await memberNumber(accountId),
    // Only a staff check exists so far, so an open application is waiting on staff.
    applications: pending.map(p => ({ ...p, waiting: 'staff' as const })),
    memberships: rows.map(r => ({
      id: r.id, schemeId: r.scheme_id, schemeName: r.scheme_name, side: r.side, length: r.option_name, startsOn: r.starts_on, endsOn: r.ends_on, mayEnd: !!r.holder_may_end,
      status: day ? derivedStatus({ startsOn: r.starts_on, endsOn: r.ends_on }, r.grace_days, day) : 'upcoming',
    })),
  }
})
