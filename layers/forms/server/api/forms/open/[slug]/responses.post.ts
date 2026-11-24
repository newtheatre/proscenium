// Sends a response (FB-301, FB-302). The id is made by the browser, so the same submission sent
// twice stores one response and gets the same reply. The server works everything out again from
// the answers: what is shown, what is required and what is valid (sendResponse, shared with the
// addResponse service).
import { getRouterParam } from 'h3'
import { placeIn, placeOf } from '../../../../slots'
import { z } from 'zod'
import { defineRoute, idSchema, nowMs, refuse } from '#kit'
import { getFormBySlug, getVersion } from '../../../../forms'
import { sendResponse } from '../../../../responses'
import type { Answers, Definition } from '../../../../../shared/engine'
import { shownMarking } from '../../../../../shared/engine'

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

  const sent = await sendResponse(unit, { form, version, link, actor, responseId: input.responseId, answers: input.answers as Answers, email: input.email ?? null, at: nowMs() })
  // MK4: the person is told only what the form says to show; a crafted score in the request is never read.
  const marking = sent.marking ? shownMarking(JSON.parse(version.definition) as Definition, sent.marking) : null
  return { responseId: sent.responseId, reference: sent.reference, marking }
})
