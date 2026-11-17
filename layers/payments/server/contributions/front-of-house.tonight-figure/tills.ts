// Payments' figure on the Front of house section of Tonight: the tills open or being counted on the
// performance's operating day. A till left being counted needs someone, so it shows as attention and
// links to the sessions being counted. The shape is front-of-house.tonight-figure's contract, which
// Payments uses without depending on Front of house.
import { sessionsOnNightOf } from '../../night'

export default {
  label: 'payments.figures.tills',
  ability: 'payments.session.view',
  order: 60, // not-policy: its place among the other modules' parts
  async read(performanceId: string) {
    const { sessions } = await sessionsOnNightOf(performanceId)
    const live = sessions.filter(s => s.state !== 'closed')
    const counting = live.some(s => s.state === 'counting')
    return {
      value: live.length,
      state: counting ? 'attention' as const : 'ok' as const,
      to: counting ? '/console/payments/sessions?view=counting' : '/console/payments/sessions',
    }
  },
}
