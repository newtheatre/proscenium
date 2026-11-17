// Signs the register as checked for a range of operating days (BAR-44's signature).
import { defineRoute } from '#kit'
import { reviewInput, sign } from '../../../age-checks'

export default defineRoute({ ability: 'bar.age-check.review', rateLimit: 'write', input: reviewInput }, async (_event, { actor, unit, input }) => await sign(unit, input, actor.accountId ?? null))
