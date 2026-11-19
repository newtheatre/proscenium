// Box office's figure for how many are in, beside each performance on the Tonight hub
// (core.tonight-figure), linking to that performance's door.
import { tonightNumbers } from '../../tonight'

export default {
  label: 'box-office.figures.in',
  ability: 'box-office.ticket.admit',
  order: 20, // not-policy: its place among the other modules' figures
  async read(performanceId: string) {
    return { value: (await tonightNumbers(performanceId)).admitted, state: 'ok' as const, to: `/live/door/${encodeURIComponent(performanceId)}` }
  },
}
