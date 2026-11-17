// Applications waiting on staff (tab 5, "Applications"; V2, V3): who applied for which scheme, when,
// and why it waits. For a student ID somebody else already used, the name the union's list gives
// for it, so staff can compare it with the applicant (V18).
import { all, defineRoute } from '#kit'

export default defineRoute({ ability: 'membership.membership.view', rateLimit: 'default' }, async () => {
  const rows = await all<{ id: string, accountId: string, accountName: string | null, schemeId: string, schemeName: string, appliedAt: number, reason: string | null, listName: string | null }>(
    `SELECT m.id, m.account_id AS accountId, a.name AS accountName, m.scheme_id AS schemeId, s.name AS schemeName, m.created_at AS appliedAt,
            v.reason, e.holder_name AS listName
       FROM membership_memberships m
       JOIN membership_schemes s ON s.id = m.scheme_id
       JOIN core_accounts a ON a.id = m.account_id
       LEFT JOIN membership_verifications v ON v.id = (SELECT id FROM membership_verifications WHERE membership_id = m.id ORDER BY created_at DESC, id DESC LIMIT 1)
       LEFT JOIN membership_verification_entries e ON e.id = v.entry_id
      WHERE m.state = 'pending' AND m.needs_verification = 1 AND m.verified_at IS NULL
      ORDER BY m.created_at, m.id`,
  )
  return { applications: rows }
})
