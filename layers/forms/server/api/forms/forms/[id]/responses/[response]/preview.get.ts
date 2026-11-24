// What a move's actions would do with this response, before the move is made: the award an
// approval would issue, and anything that would stop it. Reads only; the move decides nothing here.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { previewMove } from '../../../../../../actions'
import { getVersion, requireForm } from '../../../../../../forms'
import { getResponse } from '../../../../../../responses'
import { staffMoves, type Definition } from '../../../../../../../shared/engine'

const input = z.object({ move: z.string().min(1).max(64) }) // not-policy: shape bound

export default defineRoute({ ability: 'forms.response.move', record: event => ['forms.form', getRouterParam(event, 'id', { decode: true })], rateLimit: 'default', input }, async (event, { input, record, actor }) => {
  const form = await requireForm(record!.id)
  const response = await getResponse(getRouterParam(event, 'response', { decode: true }) ?? '')
  if (!response || response.formId !== form.id || response.state !== 'submitted') return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
  const definition = JSON.parse((await getVersion(response.versionId))!.definition) as Definition
  const move = staffMoves(definition, response.stageKey, true).find(t => t.key === input.move)
  return { previews: move ? await previewMove(response, definition, move, actor.accountId ?? null, nowMs()) : [] }
})
