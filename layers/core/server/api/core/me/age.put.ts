// Tell the theatre I am under 18 and when I turn 18, or take back what I told it (C-74). What staff
// recorded after seeing ID only staff change.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setAgeMarker } from '../../../identity/age'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ turns18On: z.string().max(10).nullable() }).strict(), // not-policy: a date's length
}, async (_event, { input, unit, actor }) => {
  await setAgeMarker(unit, actor, actor.accountId!, input.turns18On, 'self')
  return { recorded: input.turns18On !== null }
})
