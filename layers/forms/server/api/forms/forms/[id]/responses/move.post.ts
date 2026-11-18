// One move on several responses at once (FB-403). Each response is held to the rules of a single
// move: it takes the move only if its own version opens it from where the response is now, and
// never when it is the mover's own or one they have a conflict on. Those that cannot take it are
// left alone and named in the reply with the reason, and the rest move together or not at all.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, isRefusal, nowMs } from '#kit'
import { getVersion, requireForm } from '../../../../../forms'
import { getResponse } from '../../../../../responses'
import { moveResponse } from '../../../../../stages'
import type { Definition } from '../../../../../../shared/engine'

const MOST = 50 // not-policy: one screen of the responses table
// A refusal that is about the mover or what they wrote, so it is the same for every response.
const WHOLE = ['forms.decision.not-allowed', 'forms.decision.no-reason']

const input = z.object({
  responses: z.array(z.string().min(1).max(64)).min(1).max(MOST), // not-policy: shape bound
  move: z.string().min(1).max(64), // not-policy: shape bound
  note: z.string().trim().max(2000).nullish(), // not-policy: shape bound
  reason: z.string().trim().max(2000).nullish(), // not-policy: shape bound
})

export default defineRoute({ ability: 'forms.response.move', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'write', input }, async (_event, { input, record, actor, unit }) => {
  const form = await requireForm(record!.id)
  const defs = new Map<string, Definition>()
  const moved: string[] = []
  const skipped: { reference: string | null, reason: string }[] = []
  const at = nowMs()
  for (const id of new Set(input.responses)) {
    const response = await getResponse(id)
    if (!response || response.formId !== form.id || response.state !== 'submitted') {
      skipped.push({ reference: null, reason: 'There is no response here.' })
      continue
    }
    if (!defs.has(response.versionId)) defs.set(response.versionId, JSON.parse((await getVersion(response.versionId))!.definition) as Definition)
    try {
      await moveResponse(unit, { form, response, def: defs.get(response.versionId)!, transitionKey: input.move, actor, note: input.note || null, reason: input.reason || null, at })
      moved.push(response.id)
    }
    catch (error) {
      if (!isRefusal(error) || WHOLE.includes(error.code)) throw error
      skipped.push({ reference: response.reference, reason: error.reason })
    }
  }
  return { moved: moved.length, skipped }
})
