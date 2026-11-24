// Closes attendance once every place is marked (TR-13).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { closeAttendance } from '../../../../sessions'

export default defineRoute({
  ability: 'training.session.run',
  record: event => ['training.session', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  await closeAttendance(unit.view(), record!.id)
  return { sessionId: record!.id }
})
