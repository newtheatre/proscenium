// Names a trainer of the course (TR-04). Needs course.manage at the course, never a grant.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { addTrainer } from '../../../../../courses'

export default defineRoute({
  ability: 'training.course.manage',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ accountId: z.string().min(1) }),
}, async (_event, { input, record, actor, unit }) => {
  await addTrainer(unit.view(), actor, record!.id, input.accountId)
  return { courseId: record!.id }
})
