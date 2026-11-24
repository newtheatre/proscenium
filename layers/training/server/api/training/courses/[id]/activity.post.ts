// The signed-in person opened the course: their activity steps are read from each source (H2).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { readActivity } from '../../../../activity'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
  idempotent: true,
}, async (_event, { record, actor, unit }) => {
  if (!actor.accountId) refuse('core.auth.required', 'Sign in first.', { status: 401 })
  return readActivity(unit.view(), actor.accountId, { courseId: record!.id })
})
