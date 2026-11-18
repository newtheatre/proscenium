// Box office's figures beside each performance on the Tonight hub (core.tonight-figure): tickets
// sold, with reservations not yet paid for counted in, as the door counts them.
import { doorSummary } from '../../door'

export default {
  label: 'box-office.figures.sold',
  ability: 'box-office.ticket.admit',
  order: 10, // not-policy: its place among the other modules' figures
  async read(performanceId: string) {
    const summary = await doorSummary(performanceId)
    return { value: summary.tickets + summary.unpaid, state: 'ok' as const }
  },
}
