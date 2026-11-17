// The catalogue for the Products screen (S11): categories, products, sizes and their prices on every list.
import { defineRoute } from '#kit'
import { catalogue } from '../../catalogue'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'default' }, async () => await catalogue())
