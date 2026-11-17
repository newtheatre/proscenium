// Adds a product from the Add a product window: every size with its Standard price, its choices and
// its mixer measure, in one go.
import { defineRoute } from '#kit'
import { setupInput, setupProduct } from '../../../presets'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: setupInput }, async (_event, { input, actor, unit }) => await setupProduct(unit, input, actor.accountId!))
