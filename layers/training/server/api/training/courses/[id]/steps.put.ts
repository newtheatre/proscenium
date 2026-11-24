// Replaces the steps of the version in preparation (TR-02). A published version is never edited.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { saveSteps } from '../../../../courses'
import { stepsInput } from '../../../../inputs'

export default defineRoute({
  ability: 'training.course.manage',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: stepsInput,
}, async (_event, { input, record, unit }) => ({ stepIds: await saveSteps(unit.view(), record!.id, input.steps) }))
