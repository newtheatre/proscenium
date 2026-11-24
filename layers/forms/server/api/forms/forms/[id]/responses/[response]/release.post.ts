// The chair releases a response's round of reviews (FB-405): from now its panel sees the result,
// and no review changes. Needs the ability to decide on the form.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { requireForm } from '../../../../../../forms'
import { getResponse } from '../../../../../../responses'
import { latestRound, refuseConflicted, releaseRound } from '../../../../../../review'

export default defineRoute({ ability: 'forms.response.decide', record: event => ['forms.form', getRouterParam(event, 'id', { decode: true })], rateLimit: 'write', input: z.object({}) }, async (event, { record, actor, unit }) => {
  const form = await requireForm(record!.id)
  const response = await getResponse(getRouterParam(event, 'response', { decode: true }) ?? '')
  if (!response || response.formId !== form.id || response.state !== 'submitted') return refuse('forms.response.not-found', 'There is no response here.', { status: 404 }) // not-policy: HTTP status
  await refuseConflicted(actor, response.id)
  const round = await latestRound(response.id)
  if (!round || round.closedAt !== null) return refuse('forms.review.closed', 'This response is not being reviewed now.', { status: 409 }) // not-policy: HTTP status
  releaseRound(unit, round, actor, nowMs())
  return { ok: true }
})
