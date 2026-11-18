// The copy of a performance's door the live door keeps on the device, so it can check and admit
// with no connection (D2, box office review): the signing keys, each valid ticket's code hash and
// each booking. For whoever may admit at this performance.
import { getRouterParam } from 'h3'
import { defineRoute, nowMs } from '#kit'
import { getPerformance } from '#modules/core'
import { doorPack } from '../../../../../door-offline'

export default defineRoute({
  ability: 'box-office.ticket.admit',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const performance = await getPerformance(record!.id!)
  return {
    performance: { id: performance.id, title: performance.productionTitle, label: performance.label, startsAt: performance.startsAt, venue: performance.venueName },
    ...await doorPack(performance.id, nowMs()),
  }
})
