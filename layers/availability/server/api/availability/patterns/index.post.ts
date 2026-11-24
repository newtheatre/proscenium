// A new weekly pattern with its lines (AV-02, rule A2).
import { defineRoute } from '#kit'
import { createPattern } from '../../../entries'
import { patternInput } from '../../../inputs'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: patternInput }, async (_event, { actor, input, unit }) => {
  const { lines, ...pattern } = input
  return { patternId: await createPattern(unit.view(), actor.accountId!, pattern, lines ?? []) }
})
