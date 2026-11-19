// Applications waiting on staff (tab 5, "Applications"; V2, V3): who applied for which scheme, when,
// and why it waits. For a student ID somebody else already used, or whose name differs, the name the
// union's list gives for it, so staff can compare it with the applicant (V18), and who used it. For
// one the list does not hold yet, the ID as typed, which passing can add to the list. Whether passing
// starts the membership now, and the end date it would get, which staff may change on passing.
import { all, defineRoute, today } from '#kit'
import { endsOnFor } from '../../../dates'
import { getScheme, type Scheme } from '../../../schemes'

export default defineRoute({ ability: 'membership.membership.view', rateLimit: 'default' }, async () => {
  const rows = await all<{ id: string, accountId: string, accountName: string | null, schemeId: string, schemeName: string, appliedAt: number, reason: string | null, reference: string | null, listName: string | null, claimedId: string | null, claimedName: string | null, waitsAfter: number, count: number | null, entryEnds: string | null }>(
    `SELECT m.id, m.account_id AS accountId, a.name AS accountName, m.scheme_id AS schemeId, s.name AS schemeName, m.created_at AS appliedAt,
            v.reason, v.reference, e.holder_name AS listName, c.id AS claimedId, ca.name AS claimedName,
            (m.needs_approval = 1 AND m.approved_at IS NULL) OR (m.needs_payment = 1 AND m.paid_at IS NULL) AS waitsAfter, o.count,
            (SELECT pe.ends_on FROM membership_verifications pv JOIN membership_verification_entries pe ON pe.id = pv.entry_id WHERE pv.membership_id = m.id ORDER BY pv.created_at DESC LIMIT 1) AS entryEnds
       FROM membership_memberships m
       LEFT JOIN membership_length_options o ON o.id = m.length_option_id
       JOIN membership_schemes s ON s.id = m.scheme_id
       JOIN core_accounts a ON a.id = m.account_id
       LEFT JOIN membership_verifications v ON v.id = (SELECT id FROM membership_verifications WHERE membership_id = m.id ORDER BY created_at DESC, id DESC LIMIT 1)
       LEFT JOIN membership_verification_entries e ON e.id = v.entry_id
       LEFT JOIN membership_memberships c ON c.id = e.used_by AND c.id <> m.id
       LEFT JOIN core_accounts ca ON ca.id = c.account_id
      WHERE m.state = 'pending' AND m.needs_verification = 1 AND m.verified_at IS NULL
      ORDER BY m.created_at, m.id`,
  )
  const on = await today()
  const schemes = new Map<string, Scheme | null>()
  for (const r of rows) if (!schemes.has(r.schemeId)) schemes.set(r.schemeId, await getScheme(r.schemeId))
  // Who already used the ID, so Pass can say that passing gives two people one ID.
  return {
    today: on,
    applications: rows.map(({ claimedId, claimedName, waitsAfter, count, entryEnds, ...r }) => {
      const scheme = schemes.get(r.schemeId)
      const startsNow = !waitsAfter
      return { ...r, claimedBy: claimedId ? { membershipId: claimedId, name: claimedName } : null, startsNow, endsOn: startsNow ? entryEnds ?? (scheme ? endsOnFor(scheme, on, count ?? 1) : null) : null }
    }),
  }
})
