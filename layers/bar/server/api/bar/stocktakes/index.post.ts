// Starts a count at a location, of everything or of one category.
import { defineRoute } from '#kit'
import { startInput, startStocktake } from '../../../stocktakes'

export default defineRoute({ ability: 'bar.stock.count', rateLimit: 'write', input: startInput }, async (_event, { actor, input, unit }) =>
  ({ stocktakeId: await startStocktake(unit, input, actor.accountId!) }))
