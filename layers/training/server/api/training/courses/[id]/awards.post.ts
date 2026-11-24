// Awards a training record without the steps (TR-20): a reason, an expiry, never to oneself.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { directAward } from '../../../../progress'
import { directAwardInput } from '../../../../inputs'

export default defineRoute({
  ability: 'training.record.award',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: directAwardInput,
}, async (_event, { input, record, actor, unit }) => ({ recordId: await directAward(unit.view(), actor, record!.id, input) }))
