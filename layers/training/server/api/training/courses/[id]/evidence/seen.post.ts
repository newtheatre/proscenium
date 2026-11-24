// A verifier records that they saw a certificate's original, keeping nothing of it (E2).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { recordSeen } from '../../../../../evidence'
import { seenInput } from '../../../../../inputs'

export default defineRoute({
  ability: 'training.evidence.verify',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: seenInput,
}, async (_event, { input, record, actor, unit }) => recordSeen(unit.view(), actor, record!.id, input))
