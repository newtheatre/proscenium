// A person takes their own response back, where the form allows it and staff have not started on
// it. It leaves the responses staff read, and its answers go at the next retention run.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { getForm, getVersion } from '../../../../forms'
import { getResponse, owns } from '../../../../responses'
import { withdraw } from '../../../../stages'
import type { Definition } from '../../../../../shared/engine'

const input = z.object({}).strict()

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input }, async (event, { actor, unit }) => {
  const response = await getResponse(getRouterParam(event, 'id') ?? '')
  if (!response || response.state !== 'submitted' || !await owns(response, actor)) return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
  const form = (await getForm(response.formId))!
  const definition = JSON.parse((await getVersion(response.versionId))!.definition) as Definition
  withdraw(unit, { form, response, def: definition, at: nowMs() })
  return { reference: response.reference }
})
