// Writes stock off at a location, with a reason.
import { defineRoute } from '#kit'
import { wasteStock, wastageInput } from '../../../stock-moves'

export default defineRoute({ ability: 'bar.stock.waste', rateLimit: 'write', input: wastageInput }, async (_event, { actor, input, unit }) =>
  ({ wastageId: await wasteStock(unit, input, actor.accountId!) }))
