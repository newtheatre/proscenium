// A job gave up after its retries (core.job.died). When it was running an outcome action that is
// still waiting, forms announces forms.action.failed with the run, its response, form and action,
// so a module that cares (the one whose action it was, say) hears of it. The listener's own unit
// commits the event with the job's mark that it ran, so it is announced once per death; a run
// queued again and failing again is announced again.
import { defineListener, first } from '#kit'

export default defineListener(async (event, unit) => {
  if (event.payload.name !== 'forms.run-action') return
  const run = await first<{ id: string, responseId: string, formId: string, action: string }>(
    'SELECT id, response_id AS responseId, form_id AS formId, action_key AS action FROM forms_action_runs WHERE job_id = ? AND state = \'waiting\'', event.payload.jobId as string)
  if (!run) return
  unit.announce('forms.action.failed', { runId: run.id, responseId: run.responseId, formId: run.formId, action: run.action }, { record: ['forms.response', run.responseId] })
})
