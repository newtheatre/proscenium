// A person's own response (FB-304): every answer they gave, including the special-category ones,
// which are theirs to read. Nobody else's response is ever found here.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { getForm, getVersion } from '../../../forms'
import { getResponse, owns, readAnswers } from '../../../responses'
import type { Definition } from '../../../../shared/engine'
import { questionsOf } from '../../../../shared/engine'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const response = await getResponse(getRouterParam(event, 'id') ?? '')
  if (!response || response.state !== 'submitted' || !await owns(response, actor)) return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
  const form = (await getForm(response.formId))!
  const version = (await getVersion(response.versionId))!
  const definition = JSON.parse(version.definition) as Definition
  const types = new Map(questionsOf(definition).map(({ question }) => [question.id, question.type]))
  return {
    response: { id: response.id, reference: response.reference, submittedAt: response.submittedAt },
    form: { title: form.title, slug: form.slug },
    definition,
    answers: (await readAnswers([response.id], types, true)).get(response.id)!,
  }
})
