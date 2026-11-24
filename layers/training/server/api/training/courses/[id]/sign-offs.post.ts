// A trainer signs a person off on a practical step (TR-05). The award is evaluated in the same unit.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { signOffPractical } from '../../../../progress'
import { signOffInput } from '../../../../inputs'

export default defineRoute({
  ability: 'training.sign-off.record',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: signOffInput,
}, async (_event, { input, record, actor, unit }) => signOffPractical(unit.view(), actor, record!.id, input))
