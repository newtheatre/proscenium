// Adds a price list: priced by hand, or a percentage off Standard.
import { defineRoute } from '#kit'
import { addPriceList } from '../../../catalogue'
import { priceListInput } from '../../../input'

export default defineRoute({ ability: 'bar.price.manage', rateLimit: 'write', input: priceListInput }, async (_event, { input, unit }) => ({ priceListId: addPriceList(unit, input) }))
