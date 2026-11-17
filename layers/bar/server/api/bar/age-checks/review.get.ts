// How many refusals a signature over the chosen days would cover, shown before confirming.
import { defineRoute } from '#kit'
import { refusalsIn, reviewInput } from '../../../age-checks'

export default defineRoute({ ability: 'bar.age-check.review', rateLimit: 'default', input: reviewInput }, async (_event, { input }) => ({ refusals: await refusalsIn(input) }))
