// One course: what describes it, its versions, the steps of the live version and of any version in
// preparation, and its trainers.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { courseOrRefuse, preparing, stepsOf, trainersOf, versionsOf } from '../../../../courses'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const course = await courseOrRefuse(record!.id)
  const manages = (await can(actor, 'training.course.manage', record)).allowed
  if (course.status === 'unpublished' && !manages) refuse('training.course.not-found', 'There is no such course.', { status: 404 })
  const next = manages ? await preparing(course.id) : null
  return {
    course,
    live: course.liveVersionId ? await stepsOf(course.liveVersionId) : [],
    preparing: next ? { version: next, steps: await stepsOf(next.id) } : null,
    versions: manages ? await versionsOf(course.id) : [],
    trainers: await trainersOf(course.id),
    actions: {
      manage: manages,
      signOff: (await can(actor, 'training.sign-off.record', record)).allowed,
      award: (await can(actor, 'training.record.award', record)).allowed,
    },
  }
})
