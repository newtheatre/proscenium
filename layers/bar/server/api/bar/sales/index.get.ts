// Bar sales (S3): newest first, by reference, outlet, opening, state and whether refunded. With them,
// for someone who may close an outlet, what is trading now and the recent openings with their takings.
import { can, defineRoute } from '#kit'
import { outlets } from '../../../catalogue'
import { listOpenings } from '../../../openings'
import { listSales, salesFilters } from '../../../refunds'

export default defineRoute({ ability: 'bar.sale.view', rateLimit: 'default', input: salesFilters }, async (_event, { actor, input }) => ({
  rows: await listSales(input),
  outlets: (await outlets()).map(o => ({ id: o.id, name: o.name })),
  openings: (await can(actor, 'bar.opening.manage')).allowed ? await listOpenings() : [],
}))
