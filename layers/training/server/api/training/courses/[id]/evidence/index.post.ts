// Sends a certificate or a declaration for checking (TR-21, TR-46): it signs nothing off yet.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { submitEvidence } from '../../../../../evidence'
import { evidenceInput } from '../../../../../inputs'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: evidenceInput,
}, async (_event, { input, record, actor, unit }) => ({ evidenceId: await submitEvidence(unit.view(), actor, record!.id, input) }))
