// One response (FB-401): its answers against the version of the form it was sent on. Special-
// category answers come back restricted unless the person asks to see them and may; each time they
// are opened is recorded.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse, requireAbility } from '#kit'
import { getVersion, requireForm } from '../../../../../forms'
import { getResponse, readAnswers } from '../../../../../responses'
import type { Definition } from '../../../../../../shared/engine'
import { questionsOf } from '../../../../../../shared/engine'

const input = z.object({ reveal: z.enum(['1']).optional() })

export default defineRoute({ ability: 'forms.response.read', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'default', input }, async (event, { input, record, actor, unit }) => {
  const form = await requireForm(record!.id)
  const response = await getResponse(getRouterParam(event, 'response') ?? '')
  if (!response || response.formId !== form.id || response.state !== 'submitted') return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
  const version = (await getVersion(response.versionId))!
  const definition = JSON.parse(version.definition) as Definition
  const open = input.reveal === '1'
  if (open) {
    await requireAbility(actor, 'forms.response.read-special', ['forms.form', form.id])
    unit.audit({ action: 'read', ability: 'forms.response.read-special', record: ['forms.response', response.id], detail: { formId: form.id } })
  }
  const types = new Map(questionsOf(definition).map(({ question }) => [question.id, question.type]))
  const answers = (await readAnswers([response.id], types, open)).get(response.id)!
  return {
    response: { id: response.id, reference: response.reference, version: version.number, submittedAt: response.submittedAt, personId: response.personId, respondentEmail: response.respondentEmail },
    definition,
    answers,
    restricted: answers.some(a => a.restricted),
  }
})
