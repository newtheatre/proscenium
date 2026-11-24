// Notes that the signed-in person opened a reading step's material (TR-08).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { markOpened } from '../../../../../../progress'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (event, { record, actor }) => {
  await markOpened(actor, record!.id, getRouterParam(event, 'step')!)
  return { opened: true }
})
