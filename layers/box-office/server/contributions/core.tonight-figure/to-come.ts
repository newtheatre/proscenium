// How many of those sold are not yet in, on the Tonight hub (core.tonight-figure): the house still
// to arrive, which tells front of house whether to hold the start.
import { tonightNumbers } from '../../tonight'

export default {
  label: 'box-office.figures.to-come',
  ability: 'box-office.ticket.admit',
  order: 30, // not-policy: after in
  async read(performanceId: string) {
    return { value: (await tonightNumbers(performanceId)).toCome, state: 'ok' as const }
  },
}
