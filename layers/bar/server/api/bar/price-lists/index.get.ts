// The price lists, with every size's price on each (S12).
import { defineRoute } from '#kit'
import { catalogue } from '../../../catalogue'

export default defineRoute({ ability: 'bar.price.manage', rateLimit: 'default' }, async () => await catalogue())
