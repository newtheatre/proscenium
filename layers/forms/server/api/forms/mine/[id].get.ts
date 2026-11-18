// A person's own response (FB-304): every answer they gave, including the special-category ones,
// which are theirs to read. Nobody else's response is ever found here.
import { getRouterParam } from 'h3'
import { defineRoute, refuse, today } from '#kit'
import { getForm, getVersion } from '../../../forms'
import { getResponse, owns, readAnswers, toAnswers } from '../../../responses'
import type { Definition } from '../../../../shared/engine'
import { questionsOf, withoutWorkflow } from '../../../../shared/engine'
import { ownHistory, ownRights, ownStatus } from '../../../stages'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const response = await getResponse(getRouterParam(event, 'id') ?? '')
  if (!response || response.state !== 'submitted' || !await owns(response, actor)) return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
  const form = (await getForm(response.formId))!
  const version = (await getVersion(response.versionId))!
  const definition = JSON.parse(version.definition) as Definition
  const types = new Map(questionsOf(definition).map(({ question }) => [question.id, question.type]))
  const answers = (await readAnswers([response.id], types, true)).get(response.id)!
  const progress = ownStatus(definition, response)
  const rights = ownRights(form, definition, response)
  return {
    // While it is back with them, their answers in the shape the form takes, to change and send again.
    values: progress?.canChange || rights.canEdit ? toAnswers(definition, answers) : null,
    // What the form lets them still do with it: change the answers, or take it back.
    rights,
    response: { id: response.id, reference: response.reference, submittedAt: response.submittedAt },
    form: { title: form.title, slug: form.slug },
    definition: withoutWorkflow(definition),
    answers,
    // Where it is now, in the words the form chose for the person, and whether it is back with them to change.
    progress,
    history: await ownHistory(definition, response),
    today: await today(),
  }
})
