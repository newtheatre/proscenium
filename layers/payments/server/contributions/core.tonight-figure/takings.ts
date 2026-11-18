// Payments' figure beside each performance on the Tonight hub (core.tonight-figure): what the tills
// open on the performance's operating day have taken. Payments answers by the day, so two
// performances on one day show the same takings.
import { takingsOnNightOf } from '../../night'

export default {
  label: 'payments.figures.takings',
  ability: 'payments.session.view',
  order: 60, // not-policy: its place among the other modules' figures
  async read(performanceId: string) {
    const { amountMinor, currency } = await takingsOnNightOf(performanceId)
    return { value: amountMinor, state: 'ok' as const, ...currency ? { unit: currency } : {} }
  },
}
