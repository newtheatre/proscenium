// Rejects evidence with a reason the person sees (E6).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { rejectEvidence } from '../../../../evidence'
import { rejectInput } from '../../../../inputs'

export default defineRoute({
  ability: 'training.evidence.verify',
  record: event => ['training.evidence', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: rejectInput,
}, async (_event, { input, record, actor, unit }) => {
  await rejectEvidence(unit.view(), actor, record!.id, input.reason)
  return { ok: true }
})
