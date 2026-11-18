// Box office's figure for how many are in, beside each performance on the Tonight hub
// (core.tonight-figure), linking to that performance's door.
import { doorSummary } from '../../door'

export default {
  label: 'box-office.figures.in',
  ability: 'box-office.ticket.admit',
  order: 20, // not-policy: its place among the other modules' figures
  async read(performanceId: string) {
    const summary = await doorSummary(performanceId)
    return { value: summary.admitted, state: 'ok' as const, to: `/live/door/${encodeURIComponent(performanceId)}` }
  },
}
