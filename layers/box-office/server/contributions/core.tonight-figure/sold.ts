// Box office's figures beside each performance on the Tonight hub (core.tonight-figure): tickets
// sold, with reservations not yet paid for counted in, as the door counts them.
import { tonightNumbers } from '../../tonight'

export default {
  label: 'box-office.figures.sold',
  ability: 'box-office.ticket.admit',
  order: 10, // not-policy: its place among the other modules' figures
  async read(performanceId: string) {
    return { value: (await tonightNumbers(performanceId)).sold, state: 'ok' as const }
  },
}
