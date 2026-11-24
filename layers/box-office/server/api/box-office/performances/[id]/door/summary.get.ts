// The door's heading in live mode (BO-40): the performance, how many of its tickets are in, when
// latecomers are let in, and whether it was ever on sale.
import { getRouterParam } from 'h3'
import { can, defineRoute, first } from '#kit'
import { getPerformance, latecomersAt } from '#modules/core'
import { doorSummary } from '../../../../../door'

export default defineRoute({
  ability: 'box-office.ticket.admit',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const performance = await getPerformance(record!.id!)
  return {
    performance: { id: performance.id, title: performance.productionTitle, label: performance.label, startsAt: performance.startsAt, venue: performance.venueName, latecomers: await latecomersAt(performance.id) },
    ...await doorSummary(performance.id),
    // Never put on sale: the door is the counter alone (BO-73, HC1).
    onSale: !!(await first('SELECT 1 AS one FROM box_office_performance_sales WHERE performance_id = ? AND state <> \'draft\'', performance.id)),
    // Whether this person may let unpaid reservations go from the door.
    canRelease: (await can(actor, 'box-office.order.release')).allowed,
  }
})
