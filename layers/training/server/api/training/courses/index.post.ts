// Creates a course with version 1 in preparation (TR-02).
import { defineRoute } from '#kit'
import { createCourse } from '../../../courses'
import { courseInput } from '../../../inputs'

export default defineRoute({
  ability: 'training.course.manage',
  rateLimit: 'write',
  idempotent: true,
  input: courseInput,
}, (_event, { input, actor, unit }) => createCourse(unit.view(), actor, input))
