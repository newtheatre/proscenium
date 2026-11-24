// Keeps a signed-in person's working copy as they go (FB-303). Nothing is checked except its size
// and that it is theirs; it is sealed whole before it is stored. A person has one working copy per
// form: a second device carries on with the first one's.
import { getRouterParam } from 'nuxt/server'
import { placeIn, placeOf } from '../../../../slots'
import { z } from 'zod'
import { defineRoute, idSchema, nowMs, refuse } from '#kit'
import { getFormBySlug } from '../../../../forms'
import { answersLimit, draftOf, getResponse, refuseShut, shut, writeDraft } from '../../../../responses'
import type { Answers } from '../../../../../shared/engine'

const input = z.object({
  responseId: idSchema('fres'),
  answers: z.record(z.string().max(200), z.unknown()), // not-policy: shape bound
  pageId: z.string().max(100).nullable(), // not-policy: shape bound
})

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input }, async (event, { input, actor, unit }) => {
  const form = await getFormBySlug(getRouterParam(event, 'slug', { decode: true }))
  const link = form ? await placeOf(form, placeIn(event)) : null
  if (!form || !link || !form.liveVersionId) return refuse('forms.form.not-found', 'There is no form here.', { status: 404 })
  // An anonymous form keeps nothing that says who is answering, so it keeps no working copy either.
  if (form.anonymous) return refuse('forms.draft.anonymous', 'An anonymous form is answered in one sitting.', { status: 409 })
  if (JSON.stringify(input.answers).length > await answersLimit()) return refuse('forms.response.too-large', 'These answers are too long to keep.', { status: 413 }) // not-policy: HTTP status

  const mine = await draftOf(link, actor)
  const why = await shut(form, link, actor, nowMs())
  if (why) refuseShut(why)
  // The id belongs to somebody else, or to a response already sent: say no more than "not here".
  const taken = mine ? null : await getResponse(input.responseId)
  if (taken) return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })

  const responseId = mine?.response.id ?? input.responseId
  await writeDraft(unit, { existing: mine?.response ?? null, responseId, form, link, accountId: actor.accountId!, answers: input.answers as Answers, pageId: input.pageId, at: nowMs() })
  return { responseId }
})
