// One live course as a learner sees it (M3): its steps with the reader's progress and next action, its sessions and what changed.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { learnerCourse } from '../../../../learner'

export default defineRoute({
  ability: 'training.course.view',
  rateLimit: 'default',
}, async (event, { actor }) => learnerCourse(actor, getRouterParam(event, 'slug') ?? ''))
