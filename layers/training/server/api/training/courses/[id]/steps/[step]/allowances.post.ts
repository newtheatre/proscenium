// Allows a person another try at a quiz now (Q6, TR-45); never for oneself.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { allowanceInput } from '../../../../../../inputs'
import { allowAnotherTry } from '../../../../../../quizzes'

export default defineRoute({
  ability: 'training.sign-off.record',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: allowanceInput,
}, async (event, { record, input, actor, unit }) => ({ allowanceId: await allowAnotherTry(unit.view(), actor, { courseId: record!.id, stepId: getRouterParam(event, 'step')! }, input) }))
