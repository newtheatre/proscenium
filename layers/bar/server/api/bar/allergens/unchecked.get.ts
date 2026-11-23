// The sizes on sale whose labels are not all checked, for the Products screen the home card opens.
import { defineRoute } from '#kit'
import { uncheckedSizeList } from '../../../allergen-chart'

export default defineRoute({ ability: 'bar.allergens.manage', rateLimit: 'default' }, async () => ({ sizes: await uncheckedSizeList() }))
