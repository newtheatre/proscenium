// Tickets reserved and not yet paid for, beside sold on the Tonight hub (core.tonight-figure): who
// should come to the desk to pay. It links to the door, where unpaid no-shows are released.
import { tonightNumbers } from '../../tonight'

export default {
  label: 'box-office.figures.unpaid',
  ability: 'box-office.ticket.admit',
  order: 15, // not-policy: beside sold
  async read(performanceId: string) {
    return { value: (await tonightNumbers(performanceId)).unpaid, state: 'ok' as const, to: `/live/door/${encodeURIComponent(performanceId)}` }
  },
}
