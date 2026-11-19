// Seats still to sell for a performance, on the Tonight hub (core.tonight-figure), as its pools count
// them, so the desk knows what it can sell on the door.
import { tonightNumbers } from '../../tonight'

export default {
  label: 'box-office.figures.left',
  ability: 'box-office.ticket.admit',
  order: 40, // not-policy: after still to come
  async read(performanceId: string) {
    return { value: (await tonightNumbers(performanceId)).left, state: 'ok' as const }
  },
}
