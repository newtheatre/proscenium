// A response somebody answered signed out, opened through the link they were emailed when it was
// returned for changes (R-19): what they sent, the note to them, and their answers to change. The
// link may be opened as often as they like until they send their changes, it runs out, or the
// response moves on.
import { getRouterParam } from 'nuxt/server'
import { defineRoute, nowMs, refuse, today } from '#kit'
import { getForm, getVersion } from '../../../forms'
import { readAnswers, toAnswers } from '../../../responses'
import { responseByChangeLink } from '../../../changes'
import type { Definition } from '../../../../shared/engine'
import { questionsOf, withoutWorkflow } from '../../../../shared/engine'
import { ownStatus } from '../../../stages'

export default defineRoute({ public: true, rateLimit: 'presented-value', tokens: ['token'] }, async (event) => {
  const found = await responseByChangeLink(getRouterParam(event, 'token', { decode: true }) ?? '', nowMs())
  if (!found) return refuse('forms.changes.not-found', 'This link has run out or has already been used.', { status: 404, remedy: 'Reply to the email the theatre sent you and quote your reference.' })
  const { response, expiresAt } = found
  const form = (await getForm(response.formId))!
  const definition = JSON.parse((await getVersion(response.versionId))!.definition) as Definition
  const types = new Map(questionsOf(definition).map(({ question }) => [question.id, question.type]))
  const answers = (await readAnswers([response.id], types, true)).get(response.id) ?? []
  const progress = ownStatus(definition, response)
  return {
    values: progress?.canChange ? toAnswers(definition, answers) : null,
    response: { reference: response.reference, submittedAt: response.submittedAt },
    form: { title: form.title },
    definition: withoutWorkflow(definition),
    answers,
    progress,
    expiresAt,
    today: await today(),
  }
})
