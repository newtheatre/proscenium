// Uploads one file for a file question while somebody answers (F03). The body is the file's bytes;
// the response, the question and the file's name come in the query. The response's id is the one the
// page already made, so the file belongs to the response it will be sent with. A file can be added
// to a response not yet sent, or to one sent back for changes by the person it is from; core checks
// it, and the page waits for that before it can be sent.
import { getRequestHeader, getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, idSchema, nowMs, refuse } from '#kit'
import { placeIn, placeOf } from '../../../../../slots'
import { getFormBySlug, getVersion } from '../../../../../forms'
import { getResponse, owns, refuseShut, shut } from '../../../../../responses'
import { questionLimit, uploadAnswerFile } from '../../../../../files'
import type { Definition } from '../../../../../../shared/engine'
import { questionsOf, resubmitMove } from '../../../../../../shared/engine'

const input = z.object({
  response: idSchema('fres'),
  question: z.string().min(1).max(200), // not-policy: shape bound
  name: z.string().trim().min(1).max(255), // not-policy: core's column limit for a file's name
  type: z.string().max(100).default('application/octet-stream'), // not-policy: shape bound
  place: z.string().optional(),
})

export default defineRoute({ public: true, rateLimit: 'write', body: 'binary', input }, async (event, { input, actor, unit }) => {
  const notFound = () => refuse('forms.form.not-found', 'There is no form here.', { status: 404 })
  const form = await getFormBySlug(getRouterParam(event, 'slug', { decode: true }))
  const link = form ? await placeOf(form, placeIn(event)) : null
  const live = form ? await getVersion(form.liveVersionId) : null
  if (!form || !link || !live || form.status === 'draft' || form.status === 'archived') return notFound()

  // A response not yet sent answers the live version; one sent back for changes, its own.
  const existing = await getResponse(input.response)
  let definition: Definition
  if (!existing) {
    const why = await shut(form, link, actor, nowMs())
    if (why) refuseShut(why)
    definition = JSON.parse(live.definition) as Definition
  }
  else {
    const theirs = existing.formId === form.id && await owns(existing, actor)
    if (!theirs) return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
    if (existing.state === 'draft') {
      const why = await shut(form, link, actor, nowMs())
      if (why) refuseShut(why)
      definition = JSON.parse(live.definition) as Definition
    }
    else {
      definition = JSON.parse((await getVersion(existing.versionId))!.definition) as Definition
      if (existing.state !== 'submitted' || !resubmitMove(definition, existing.stageKey)) return refuse('forms.response.not-returned', 'This response is not open for changes.', { status: 409 }) // not-policy: HTTP status
    }
  }
  const question = questionsOf(definition).find(({ question: q }) => q.id === input.question)?.question
  if (!question || question.type !== 'file') return refuse('forms.files.not-a-file-question', 'This question does not take files.', { status: 422 }) // not-policy: HTTP status

  const limit = await questionLimit(question)
  const tooLarge = () => refuse('forms.files.too-large', 'This file is larger than this question takes.', { status: 413, fields: { file: 'forms.files.too-large' } }) // not-policy: HTTP status
  if (Number(getRequestHeader(event, 'content-length') ?? 0) > limit) return tooLarge()
  const body = new Uint8Array(await event.req.arrayBuffer())
  const bytes = body ? new Uint8Array(body) : new Uint8Array()
  return uploadAnswerFile(unit, { responseId: input.response, question, actor, name: input.name, type: input.type, bytes })
})
