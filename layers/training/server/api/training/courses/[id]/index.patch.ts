// Changes what describes a course: its title, summary, category, validity and sign-up.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateCourse } from '../../../../courses'
import { courseChange } from '../../../../inputs'

export default defineRoute({
  ability: 'training.course.manage',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: courseChange,
}, async (_event, { input, record, unit }) => {
  await updateCourse(unit.view(), record!.id, input)
  return { courseId: record!.id }
})
