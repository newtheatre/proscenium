// A test fixture, not a product module: a second stand-in owner of money, as a bar will be, so one
// payment for two owners is tested before the Bar module exists.
import { defineModule } from '#kit'

export default defineModule({
  id: 'snacks',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['finance'],
  contributes: {
    'finance.system-account': [
      { id: 'income', name: 'Snack income', kind: 'income' },
    ],
  },
})
