// Publishes the version in preparation (TR-03, TR-18).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { publish } from '../../../../courses'
import { publishInput } from '../../../../inputs'

export default defineRoute({
  ability: 'training.course.manage',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: publishInput,
}, async (_event, { input, record, actor, unit }) => publish(unit.view(), actor, record!.id, input))
