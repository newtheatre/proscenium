// Makes a series and every date not left out, whole or not at all (SP-20, rules R1 and R4).
import { defineRoute } from '#kit'
import { seriesInput } from '../../../inputs'
import { createSeries } from '../../../series'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: seriesInput }, async (_event, { actor, input, unit }) =>
  await createSeries(unit.view(), actor, input))
