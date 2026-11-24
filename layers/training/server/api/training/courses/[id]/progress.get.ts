// The signed-in person's progress on a course: each step they need and whether it is met.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { courseOrRefuse } from '../../../../courses'
import { progressOn } from '../../../../progress'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const { basis, steps, complete } = await progressOn(await courseOrRefuse(record!.id), actor.accountId!)
  return { basis, steps, complete }
})
