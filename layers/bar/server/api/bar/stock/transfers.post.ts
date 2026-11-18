// Moves stock from one location to another.
import { defineRoute } from '#kit'
import { transferInput, transferStock } from '../../../stock-moves'

export default defineRoute({ ability: 'bar.stock.receive', rateLimit: 'write', input: transferInput }, async (_event, { actor, input, unit }) =>
  ({ transferId: await transferStock(unit, input, actor.accountId!) }))
