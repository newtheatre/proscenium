// A quiz as the person is sent it, without the answers, and where they stand on its tries (Q3, Q4).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { quizFor } from '../../../../../../quizzes'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, (event, { record, actor }) => quizFor(actor, record!.id, getRouterParam(event, 'step')!))
