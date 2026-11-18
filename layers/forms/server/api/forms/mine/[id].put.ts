// A person sends their changes back (FB-404), or changes their answers where the form allows edits. Otherwise only while their response is in a stage that returns
// it to them; the answers are checked as a first send is, and kept as a new revision beside the
// earlier ones, which nothing changes.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { getForm, getVersion } from '../../../forms'
import { answersLimit, getResponse, owns } from '../../../responses'
import { amend, ownRights, resubmit } from '../../../stages'
import { resubmitMove } from '../../../../shared/engine'
import type { Answers, Definition } from '../../../../shared/engine'

const input = z.object({ answers: z.record(z.string(), z.unknown()) })

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input }, async (event, { input, actor, unit }) => {
  const response = await getResponse(getRouterParam(event, 'id') ?? '')
  if (!response || response.state !== 'submitted' || !await owns(response, actor)) return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
  if (JSON.stringify(input.answers).length > await answersLimit()) return refuse('forms.response.too-large', 'These answers are too long to send.', { status: 413, remedy: 'Shorten the longest answers.' }) // not-policy: HTTP status
  const form = (await getForm(response.formId))!
  const definition = JSON.parse((await getVersion(response.versionId))!.definition) as Definition
  // Not back with them for changes: where the form allows edits, the answers change and the response stays where it is.
  if (!resubmitMove(definition, response.stageKey) && ownRights(form, definition, response).canEdit) {
    await amend(unit, { form, response, def: definition, actor, answers: input.answers as Answers, at: nowMs() })
    return { reference: response.reference, status: null }
  }
  const stage = await resubmit(unit, { form, response, def: definition, actor, answers: input.answers as Answers, at: nowMs() })
  return { reference: response.reference, status: stage.status?.trim() || stage.name }
})
