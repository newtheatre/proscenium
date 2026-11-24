// Every date a series would fall on, each with what would happen to it (SP-20, rules R2 to R5).
import { defineRoute } from '#kit'
import { seriesCheckInput } from '../../../inputs'
import { checkSeries } from '../../../series'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: seriesCheckInput }, async (_event, { actor, input }) => await checkSeries(actor, input))
