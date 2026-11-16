// A test fixture, not a product module: a pretend card provider that answers by status and webhook,
// so Payments' webhook and reconcile paths are tested before Stripe or SumUp exist.
import { defineModule } from '#kit'

export default defineModule({
  id: 'cardco',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['payments'],
  contributes: {
    'payments.provider': [{ id: 'cardco' }],
  },
})
