// Takes the person's answers: marked on the server, counted against the limit, a pass signs off (Q2, TR-43).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { quizInput } from '../../../../../../inputs'
import { submitQuiz } from '../../../../../../quizzes'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: quizInput,
}, (event, { record, input, actor, unit }) => submitQuiz(unit.view(), actor, { courseId: record!.id, stepId: getRouterParam(event, 'step')! }, input.answers))
