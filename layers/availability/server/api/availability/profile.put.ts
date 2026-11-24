// What my unmarked time means: unknown, free, or the theatre's default (rule A4).
import { defineRoute } from '#kit'
import { setUnmarked } from '../../entries'
import { unmarkedInput } from '../../inputs'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: unmarkedInput }, async (_event, { actor, input, unit }) => {
  await setUnmarked(unit.view(), actor.accountId!, input.unmarkedMeans)
  return { unmarkedMeans: input.unmarkedMeans }
})
