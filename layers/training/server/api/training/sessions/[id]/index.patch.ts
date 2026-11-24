// Changes a session; moving a published one checks the room and tells everyone with a place (P4, P5, P10).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { sessionChange } from '../../../../inputs'
import { updateSession } from '../../../../sessions'

export default defineRoute({
  ability: 'training.session.manage',
  record: event => ['training.session', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: sessionChange,
}, async (_event, { record, input, unit }) => {
  await updateSession(unit.view(), record!.id, input)
  return { sessionId: record!.id }
})
