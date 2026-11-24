// Cancels a session with a reason; every place is cancelled and told.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { cancelSessionInput } from '../../../../inputs'
import { cancelSession } from '../../../../sessions'

export default defineRoute({
  ability: 'training.session.manage',
  record: event => ['training.session', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: cancelSessionInput,
}, async (_event, { record, input, unit }) => {
  await cancelSession(unit.view(), record!.id, input.reason)
  return { sessionId: record!.id }
})
