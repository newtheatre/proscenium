// One stroke on My availability (AV-04): part of a day painted free, maybe or busy, or cleared, as an
// entry for that day or as a change to the pattern covering it.
import { defineRoute } from '#kit'
import { strokeInput } from '../../inputs'
import { paint } from '../../paint'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: strokeInput }, async (_event, { actor, input, unit }) => {
  await paint(unit.view(), actor.accountId!, input)
  return { painted: true }
})
