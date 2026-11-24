// Runs an outcome action again after it failed (FB-506): for somebody who decides on the form.
// Refused unless its job has given up, so an action is never queued twice.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { runAgain } from '../../../../../../../../actions'
import { getResponse } from '../../../../../../../../responses'

export default defineRoute({ ability: 'forms.response.decide', record: event => ['forms.form', getRouterParam(event, 'id', { decode: true })], rateLimit: 'write', input: z.object({}) }, async (event, { record, unit }) => {
  const response = await getResponse(getRouterParam(event, 'response', { decode: true }) ?? '')
  if (!response || response.formId !== record!.id) return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
  await runAgain(unit, response.id, getRouterParam(event, 'run', { decode: true }) ?? '')
  return { ok: true }
})
