// My forms (FB-304): what the person has started and what they have sent, on any device. Reads go
// through the account scope, so a response made under an account since merged into theirs is here.
import { all, defineRoute } from '#kit'
import { accountScopeSql } from '#kit/accounts'

interface Mine { responseId: string, reference: string, state: 'draft' | 'submitted', title: string, slug: string, open: number, submittedAt: number | null, updatedAt: number }

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const rows = await all<Mine>(
    `SELECT r.id AS responseId, r.reference, r.state, f.title, f.slug, (f.status = 'live' AND p.status = 'active') AS open, r.submitted_at AS submittedAt, r.updated_at AS updatedAt
     FROM forms_responses r JOIN forms_forms f ON f.id = r.form_id JOIN forms_placements p ON p.id = r.placement_id
     WHERE r.person_id IN (${accountScopeSql('?1')}) AND r.state IN ('draft', 'submitted')
     ORDER BY COALESCE(r.submitted_at, r.updated_at) DESC LIMIT 200`, actor.accountId) // not-policy: more than anyone has; the page is not paged
  return {
    drafts: rows.filter(r => r.state === 'draft').map(r => ({ responseId: r.responseId, title: r.title, slug: r.slug, open: !!r.open, updatedAt: r.updatedAt })),
    sent: rows.filter(r => r.state === 'submitted').map(r => ({ responseId: r.responseId, reference: r.reference, title: r.title, slug: r.slug, submittedAt: r.submittedAt })),
  }
})
