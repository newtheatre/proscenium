// Sets a size's price on a list, from now or a later moment (BAR-04). A price is never edited: the new
// row replaces the old from its moment, so a bar sale already rung up keeps its price.
import { defineRoute } from '#kit'
import { setPrice } from '../../catalogue'
import { priceInput } from '../../input'

export default defineRoute({ ability: 'bar.price.manage', rateLimit: 'write', input: priceInput }, async (_event, { input, actor, unit }) => ({ priceId: await setPrice(unit, input, actor.accountId!) }))
