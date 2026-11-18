// Moves a response to another stage (FB-403). The move must be one the response's own version
// opens to staff from where the response is now, and never on one's own response. What is written
// to the person who sent it goes with the move, and is what they read under My forms.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { getVersion, requireForm } from '../../../../../../forms'
import { getResponse } from '../../../../../../responses'
import { moveResponse } from '../../../../../../stages'
import type { Definition } from '../../../../../../../shared/engine'

const input = z.object({
  move: z.string().min(1).max(64), // not-policy: shape bound
  note: z.string().trim().max(2000).nullish(), // not-policy: shape bound
  reason: z.string().trim().max(2000).nullish(), // not-policy: shape bound
})

export default defineRoute({ ability: 'forms.response.move', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'write', input }, async (event, { input, record, actor, unit }) => {
  const form = await requireForm(record!.id)
  const response = await getResponse(getRouterParam(event, 'response') ?? '')
  if (!response || response.formId !== form.id || response.state !== 'submitted') return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
  const definition = JSON.parse((await getVersion(response.versionId))!.definition) as Definition
  const stage = await moveResponse(unit, { form, response, def: definition, transitionKey: input.move, actor, note: input.note || null, reason: input.reason || null, at: nowMs() })
  return { stage: { key: stage.key, name: stage.name, kind: stage.kind } }
})
