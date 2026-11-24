// Takes a person off the course's trainers.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { removeTrainer } from '../../../../../courses'

export default defineRoute({
  ability: 'training.course.manage',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { record, unit }) => {
  await removeTrainer(unit.view(), record!.id, getRouterParam(event, 'account')!)
  return { courseId: record!.id }
})
