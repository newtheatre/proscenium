// Every scheme, drafts and archived ones too, with how many hold each now: the console's list.
import { all, defineRoute } from '#kit'
import { todayOrNull } from '../../../memberships'
import { listSchemes } from '../../../schemes'

export default defineRoute({ ability: 'membership.scheme.view', rateLimit: 'default' }, async () => {
  const schemes = await listSchemes()
  const day = await todayOrNull()
  const counts = day
    ? await all<{ scheme_id: string, n: number }>(
        `SELECT m.scheme_id, count(DISTINCT m.account_id) AS n FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id
        WHERE m.state = 'active' AND m.starts_on <= ?1 AND (m.ends_on IS NULL OR date(m.ends_on, '+' || s.grace_days || ' days') >= ?1)
        GROUP BY m.scheme_id`,
        day,
      )
    : []
  const held = new Map(counts.map(c => [c.scheme_id, c.n]))
  return { schemes: schemes.map(s => ({ ...s, holders: held.get(s.id) ?? 0 })) }
})
