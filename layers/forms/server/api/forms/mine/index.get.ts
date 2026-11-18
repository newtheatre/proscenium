// My forms (FB-304): what the person has started and what they have sent, on any device. Reads go
// through the account scope, so a response made under an account since merged into theirs is here.
import { all, defineRoute } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { Definition, Workflow } from '../../../../shared/engine'
import { resubmitMove, stageOf, statusOf } from '../../../../shared/engine'

interface Mine { stageKey: string | null, stageKind: string | null, stageNote: string | null, currentRevision: number, definition: string | null, responseId: string, reference: string, state: 'draft' | 'submitted', title: string, slug: string, open: number, submittedAt: number | null, updatedAt: number }

/** Where a sent response is, in the form's words for the person. Null for a form without stages. */
function progressOf(r: Mine): { status: string, kind: string, canChange: boolean } | null {
  const workflow = r.definition ? JSON.parse(r.definition) as Workflow : null
  if (!workflow?.stages.length) return null
  const def = { format: 1, pages: [], workflow } as Definition
  const stage = stageOf(def, r.stageKey)
  return stage ? { status: statusOf(stage), kind: stage.kind, canChange: !!resubmitMove(def, r.stageKey) } : null
}

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const rows = await all<Mine>(
    `SELECT r.id AS responseId, r.reference, r.state, f.title, f.slug, (f.status = 'live' AND p.status = 'active') AS open, r.submitted_at AS submittedAt, r.updated_at AS updatedAt,
       r.stage_key AS stageKey, r.stage_kind AS stageKind, r.stage_note AS stageNote, r.current_revision AS currentRevision, CASE WHEN r.state = 'submitted' THEN json_extract(v.definition, '$.workflow') END AS definition
     FROM forms_responses r JOIN forms_forms f ON f.id = r.form_id JOIN forms_placements p ON p.id = r.placement_id LEFT JOIN forms_versions v ON v.id = r.version_id
     WHERE r.person_id IN (${accountScopeSql('?1')}) AND r.state IN ('draft', 'submitted')
     ORDER BY COALESCE(r.submitted_at, r.updated_at) DESC LIMIT 200`, actor.accountId) // not-policy: more than anyone has; the page is not paged
  return {
    drafts: rows.filter(r => r.state === 'draft').map(r => ({ responseId: r.responseId, title: r.title, slug: r.slug, open: !!r.open, updatedAt: r.updatedAt })),
    sent: rows.filter(r => r.state === 'submitted').map(r => ({ responseId: r.responseId, reference: r.reference, title: r.title, slug: r.slug, submittedAt: r.submittedAt, progress: progressOf(r) })),
  }
})
