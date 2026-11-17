// A person's memberships, for the Membership tab on their console page (tab 4, core.record-tab): every
// membership and application of theirs, newest first, with its status worked out from today.
import { getRouterParam } from 'h3'
import { all, defineRoute } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { derivedStatus } from '../../../../dates'
import { memberNumber, todayOrNull } from '../../../../memberships'

export default defineRoute({ ability: 'membership.membership.view', rateLimit: 'default' }, async (event) => {
  const accountId = getRouterParam(event, 'id')!
  const day = await todayOrNull() ?? '0000-01-01'
  const rows = await all<{ id: string, scheme: string, state: string, starts_on: string | null, ends_on: string | null, grace_days: number, end_reason: string | null }>(
    `SELECT m.id, s.name AS scheme, m.state, m.starts_on, m.ends_on, s.grace_days, m.end_reason FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id
      WHERE m.account_id IN (${accountScopeSql('?1')}) ORDER BY m.created_at DESC, m.id LIMIT 50`, // not-policy: more than anybody holds
    accountId,
  )
  return {
    number: (await memberNumber(accountId))?.label ?? null,
    memberships: rows.map(r => ({
      id: r.id,
      scheme: r.scheme,
      status: r.state === 'active' && r.starts_on ? derivedStatus({ startsOn: r.starts_on, endsOn: r.ends_on }, r.grace_days, day) : r.state,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
    })),
  }
})
