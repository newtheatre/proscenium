// Publishes a session into its space, if the space is free then (P10).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { publishSession } from '../../../../sessions'

export default defineRoute({
  ability: 'training.session.manage',
  record: event => ['training.session', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { record, unit }) => {
  await publishSession(unit.view(), record!.id)
  return { sessionId: record!.id }
})
