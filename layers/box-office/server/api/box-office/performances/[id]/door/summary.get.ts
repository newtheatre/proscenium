// The door's heading in live mode (BO-40): the performance, and how many of its tickets are in.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { getPerformance } from '#modules/core'
import { doorSummary } from '../../../../../door'

export default defineRoute({
  ability: 'box-office.ticket.admit',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const performance = await getPerformance(record!.id!)
  return {
    performance: { id: performance.id, title: performance.productionTitle, label: performance.label, startsAt: performance.startsAt, venue: performance.venueName },
    ...await doorSummary(performance.id),
  }
})
