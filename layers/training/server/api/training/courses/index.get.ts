// The course catalogue: live courses for anyone who may see them, every course for course managers.
import { can, defineRoute } from '#kit'
import { listCourses } from '../../../courses'

export default defineRoute({
  ability: 'training.course.view',
  rateLimit: 'default',
}, async (_event, { actor }) => ({ courses: await listCourses({ unpublished: (await can(actor, 'training.course.manage')).allowed }) }))
