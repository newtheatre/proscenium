// One review, for the reviewer it was asked of (FB-405): the response's answers, what to mark, and
// their own review. Special-category answers stay shut. The result is here only once the round is
// released, or from the start where the stage reviews in the open.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { getForm, getVersion, accountName } from '../../../forms'
import { getResponse, readAnswers, storedFigures } from '../../../responses'
import { ownAssignment, ownReview, roundView, waitingFor } from '../../../review'
import { aboutOf } from '../../../slots'
import type { Definition } from '../../../../shared/engine'
import { questionsOf, stageOf, publicDefinition, withoutWorkflow } from '../../../../shared/engine'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const { assignment, round } = await ownAssignment(getRouterParam(event, 'id') ?? '', actor)
  const response = (await getResponse(assignment.responseId))!
  const definition = JSON.parse((await getVersion(response.versionId))!.definition) as Definition
  const stage = stageOf(definition, round.stageKey)
  if (!stage?.review || response.state !== 'submitted') return refuse('forms.review.not-found', 'There is no review here.', { status: 404 }) // not-policy: HTTP status
  const types = new Map(questionsOf(definition).map(({ question }) => [question.id, question.type]))
  // The round keeps the revision it opened on, so a reviewer marks what was sent to them.
  const answers = (await readAnswers([response.id], types, false, round.revision)).get(response.id)!
  const view = await roundView(definition, response.id, 'panel')
  const form = (await getForm(response.formId))!
  // The next response still waiting on this reviewer, so one review leads to the next.
  const next = (await waitingFor(actor.accountId!)).find(w => w.status === 'assigned' && w.assignmentId !== assignment.id)
  return {
    id: assignment.id,
    form: { title: form.title },
    response: { reference: response.reference, submittedAt: response.submittedAt },
    // What it is about, where the form is attached to a record, and who sent it unless the form is anonymous.
    about: await aboutOf(response),
    from: form.anonymous ? null : response.personId ? await accountName(response.personId) : response.respondentEmail,
    next: next?.assignmentId ?? null,
    stage: stage.name,
    mode: stage.review.mode,
    criteria: stage.review.criteria ?? [],
    definition: publicDefinition(withoutWorkflow(definition)),
    answers,
    // The calculated values belong to the latest revision; a round opened on an earlier one shows none.
    calculated: round.revision === response.currentRevision ? storedFigures(definition, response.calculated, false) : null,
    mine: ownReview(assignment),
    open: round.closedAt === null,
    released: round.releasedAt !== null,
    // Only the latest round's result is ever shown, and only if this is that round.
    result: view && view.roundId === round.id ? { assigned: view.assigned, submitted: view.submitted, tally: view.tally, summary: view.summary, reviews: view.reviews } : null,
  }
})
