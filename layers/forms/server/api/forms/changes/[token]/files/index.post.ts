// Uploads one file for a file question while somebody who answered signed out changes their answers
// through their emailed link (R-19, F03). The link names the response, so only the question and the
// file's name come in the query. Sending the changes later spends the link; uploading does not.
import { getRequestHeader, getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { getVersion } from '../../../../../forms'
import { responseByChangeLink } from '../../../../../changes'
import { questionLimit, uploadAnswerFile } from '../../../../../files'
import type { Definition } from '../../../../../../shared/engine'
import { questionsOf, resubmitMove } from '../../../../../../shared/engine'

const input = z.object({
  question: z.string().min(1).max(200), // not-policy: shape bound
  name: z.string().trim().min(1).max(255), // not-policy: core's column limit for a file's name
  type: z.string().max(100).default('application/octet-stream'), // not-policy: shape bound
})

export default defineRoute({ public: true, rateLimit: 'write', body: 'binary', tokens: ['token'], input }, async (event, { input, actor, unit }) => {
  const found = await responseByChangeLink(getRouterParam(event, 'token', { decode: true }) ?? '', nowMs())
  if (!found) return refuse('forms.changes.not-found', 'This link has run out or has already been used.', { status: 404, remedy: 'Reply to the email the theatre sent you and quote your reference.' })
  const { response } = found
  const definition = JSON.parse((await getVersion(response.versionId))!.definition) as Definition
  if (!resubmitMove(definition, response.stageKey)) return refuse('forms.response.not-returned', 'This response is not open for changes.', { status: 409 }) // not-policy: HTTP status
  const question = questionsOf(definition).find(({ question: q }) => q.id === input.question)?.question
  if (!question || question.type !== 'file') return refuse('forms.files.not-a-file-question', 'This question does not take files.', { status: 422 }) // not-policy: HTTP status

  if (Number(getRequestHeader(event, 'content-length') ?? 0) > await questionLimit(question)) return refuse('forms.files.too-large', 'This file is larger than this question takes.', { status: 413, fields: { file: 'forms.files.too-large' } }) // not-policy: HTTP status
  const body = new Uint8Array(await event.req.arrayBuffer())
  return uploadAnswerFile(unit, { responseId: response.id, question, actor, name: input.name, type: input.type, bytes: body ? new Uint8Array(body) : new Uint8Array() })
})
