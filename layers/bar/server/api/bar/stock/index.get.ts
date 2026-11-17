// Stock items with their levels at each location, and the locations (tab 2, "Stock").
import { defineRoute } from '#kit'
import { stock } from '../../../stock'

export default defineRoute({ ability: 'bar.stock.manage', rateLimit: 'default' }, async () => await stock())
