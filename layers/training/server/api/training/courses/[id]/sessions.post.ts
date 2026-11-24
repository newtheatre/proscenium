// Schedules a session of the course, unpublished until published (TR-09).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { sessionInput } from '../../../../inputs'
import { createSession } from '../../../../sessions'

export default defineRoute({
  ability: 'training.session.manage',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: sessionInput,
}, async (_event, { record, input, actor, unit }) => ({ sessionId: await createSession(unit.view(), actor, record!.id, input) }))
