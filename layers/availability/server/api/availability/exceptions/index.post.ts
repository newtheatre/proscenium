// A dated entry of my own (AV-03, rule A3).
import { defineRoute } from '#kit'
import { createException } from '../../../entries'
import { exceptionInput } from '../../../inputs'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: exceptionInput }, async (_event, { actor, input, unit }) =>
  ({ exceptionId: await createException(unit.view(), actor.accountId!, actor.accountId!, input) }))
