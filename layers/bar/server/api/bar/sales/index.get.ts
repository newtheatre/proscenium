// Bar sales (S3): newest first, by reference, outlet, state and whether refunded.
import { defineRoute } from '#kit'
import { outlets } from '../../../catalogue'
import { listSales, salesFilters } from '../../../refunds'

export default defineRoute({ ability: 'bar.sale.view', rateLimit: 'default', input: salesFilters }, async (_event, { input }) => ({
  rows: await listSales(input),
  outlets: (await outlets()).map(o => ({ id: o.id, name: o.name })),
}))
