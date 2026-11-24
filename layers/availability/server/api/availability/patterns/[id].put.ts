// Renames or re-dates one of my patterns, and replaces its lines when given (AV-02).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updatePattern } from '../../../entries'
import { patternInput } from '../../../inputs'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: patternInput }, async (event, { actor, input, unit }) => {
  const { lines, ...pattern } = input
  await updatePattern(unit.view(), actor.accountId!, getRouterParam(event, 'id')!, pattern, lines ?? null)
  return { patternId: getRouterParam(event, 'id')! }
})
