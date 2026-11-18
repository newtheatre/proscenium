// A form's life after it is published (form builder specification, part 3): paused and resumed,
// closed and opened again, archived and brought back. Paused or closed, it takes no new responses;
// staff carry on with the ones it has. It can be archived once it is closed and nothing is still
// waiting on anybody, and an archived form is out of the way but keeps its responses, which leave
// by retention. A form never published can be archived too, in place of deleting it.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, nowMs, refuse } from '#kit'
import { requireForm } from '../../../../forms'

const CONFLICT = 409 // not-policy: HTTP status
type Status = 'draft' | 'live' | 'paused' | 'closed' | 'archived'
/** Where each status may go. Back out of the archive is to closed, or to draft for a form never published. */
const OPEN: Record<Status, Status[]> = { draft: ['archived'], live: ['paused', 'closed'], paused: ['live', 'closed'], closed: ['live', 'archived'], archived: ['closed', 'draft'] }
const input = z.object({ to: z.enum(['live', 'paused', 'closed', 'archived', 'draft']) })

export default defineRoute({ ability: 'forms.form.publish', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'write', input }, async (_event, { input, record, unit }) => {
  const form = await requireForm(record!.id)
  if (form.status === input.to) return { status: form.status }
  const published = form.liveVersionId !== null
  if (!OPEN[form.status].includes(input.to) || (form.status === 'archived' && (input.to === 'draft') === published))
    return refuse('forms.form.status', 'This form cannot be changed in that way from where it is now.', { status: CONFLICT, remedy: 'Open the form again to see where it is now.' })
  if (input.to === 'archived') {
    const waiting = await first<{ n: number }>('SELECT count(*) AS n FROM forms_responses WHERE form_id = ? AND state = \'submitted\' AND stage_kind IN (\'pending\', \'in_review\', \'returned\')', form.id)
    if (waiting?.n) return refuse('forms.form.responses-waiting', `${waiting.n === 1 ? 'One response is' : `${waiting.n} responses are`} still waiting on somebody.`, { status: CONFLICT, remedy: 'Move each to a final stage, then archive the form.' })
  }
  unit.add({ sql: 'UPDATE forms_forms SET status = ?, archived_at = ? WHERE id = ? AND status = ?', params: [input.to, input.to === 'archived' ? nowMs() : null, form.id, form.status] })
    .expect(1, { code: 'forms.form.status', reason: 'This form has just been changed by somebody else.', remedy: 'Open it again to see where it is now.' })
  unit.audit({ action: 'state', record: ['forms.form', form.id], detail: { from: form.status, to: input.to } })
  if (input.to === 'closed' && form.status !== 'archived') unit.announce('forms.form.closed', { formId: form.id }, { record: ['forms.form', form.id] })
  return { status: input.to }
})
