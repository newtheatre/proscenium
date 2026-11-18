// Sends a response (FB-301, FB-302). The id is made by the browser, so the same submission sent
// twice stores one response and gets the same reply. The server works everything out again from
// the answers: what is shown, what is required and what is valid.
import { getRouterParam } from 'h3'
import { placeIn, placeOf } from '../../../../slots'
import { z } from 'zod'
import { defineRoute, idSchema, nowMs, refuse } from '#kit'
import { getFormBySlug, getVersion } from '../../../../forms'
import { answersLimit, getResponse, owns, refuseShut, shut, writeSubmission } from '../../../../responses'
import type { Answers } from '../../../../../shared/engine'

const input = z.object({
  responseId: idSchema('fres'),
  answers: z.record(z.string().max(200), z.unknown()), // not-policy: shape bound
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)).nullish(), // not-policy: the longest address there can be
})

export default defineRoute({ public: true, rateLimit: 'public-form', protect: 'turnstile', input }, async (event, { input, actor, unit }) => {
  const form = await getFormBySlug(getRouterParam(event, 'slug'))
  const link = form ? await placeOf(form, placeIn(event)) : null
  const version = form ? await getVersion(form.liveVersionId) : null
  if (!form || !link || !version) return refuse('forms.form.not-found', 'There is no form here.', { status: 404 })

  const existing = await getResponse(input.responseId)
  const theirs = existing ? await owns(existing, actor) : false
  if (existing) {
    // Sent before: the same reply, and nothing written. A signed-out person's is known by the address it carried.
    const same = existing.formId === form.id && (theirs || (!existing.personId && !actor.accountId && existing.respondentEmail === (form.anonymous ? null : input.email ?? null)))
    if (existing.state === 'submitted' && same) return { responseId: existing.id, reference: existing.reference }
    // Somebody else's id reads the same as one that was never an id.
    if (!(existing.state === 'draft' && theirs && existing.formId === form.id)) return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
  }

  const why = await shut(form, link, actor, nowMs())
  if (why) refuseShut(why)
  if (JSON.stringify(input.answers).length > await answersLimit()) return refuse('forms.response.too-large', 'These answers are too long to send.', { status: 413 }) // not-policy: HTTP status
  const email = input.email ?? null
  if (!form.anonymous && !actor.accountId && !email)
    return refuse('forms.response.email-needed', 'Give an email address so we know who these answers are from.', { status: 422, fields: { email: 'forms.response.email-needed' } })

  const { reference } = await writeSubmission(unit, { responseId: input.responseId, form, version, link, actor, email, answers: input.answers as Answers, draft: existing, at: nowMs() })
  return { responseId: input.responseId, reference }
})
