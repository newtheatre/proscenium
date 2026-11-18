// Somebody who answered signed out sends the changes asked for, through their emailed link (R-19).
// The answers are checked as a first send is and kept as a new revision, and the response takes the
// form's move back, exactly as PUT /api/forms/mine/:id does for somebody signed in. Sending spends
// the link.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { getForm, getVersion } from '../../../forms'
import { answersLimit } from '../../../responses'
import { responseByChangeLink, spendChangeLink } from '../../../changes'
import { resubmit } from '../../../stages'
import type { Answers, Definition } from '../../../../shared/engine'

const input = z.object({ answers: z.record(z.string().max(200), z.unknown()) }) // not-policy: shape bound

export default defineRoute({ public: true, rateLimit: 'public-form', protect: 'turnstile', tokens: ['token'], input }, async (event, { input, actor, unit }) => {
  const at = nowMs()
  const found = await responseByChangeLink(getRouterParam(event, 'token') ?? '', at)
  if (!found) return refuse('forms.changes.not-found', 'This link has run out or has already been used.', { status: 404, remedy: 'Reply to the email the theatre sent you and quote your reference.' })
  if (JSON.stringify(input.answers).length > await answersLimit()) return refuse('forms.response.too-large', 'These answers are too long to send.', { status: 413, remedy: 'Shorten the longest answers.' }) // not-policy: HTTP status
  const { response, hash } = found
  const form = (await getForm(response.formId))!
  const definition = JSON.parse((await getVersion(response.versionId))!.definition) as Definition
  spendChangeLink(unit, response.id, hash)
  const stage = await resubmit(unit, { form, response, def: definition, actor, answers: input.answers as Answers, at })
  return { reference: response.reference, status: stage.status?.trim() || stage.name }
})
