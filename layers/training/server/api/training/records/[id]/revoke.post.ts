// Revokes a training record with a code and a note (TR-19). It cannot be undone.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { revokeRecord } from '../../../../progress'
import { revokeInput } from '../../../../inputs'

export default defineRoute({
  ability: 'training.record.revoke',
  record: event => ['training.record', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: revokeInput,
}, async (_event, { input, record, actor, unit }) => {
  await revokeRecord(unit.view(), actor, record!.id, input)
  return { recordId: record!.id }
})
