// A test fixture, not a product module: a stand-in owner of money, so Finance and Payments are
// tested before Box office exists. It declares ledger accounts as Box office will.
import { ability, defineAbilities, defineModule } from '#kit'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'tickets',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['finance', 'payments'],
  tables,
  abilities: defineAbilities('tickets', { 'orders.sell': ability() }),
  contributes: {
    'payments.settlement': [{ id: 'tickets' }],
    'payments.desk-basket': [{ id: 'tickets' }],
    'finance.system-account': [
      { id: 'income', name: 'Ticket income', kind: 'income' },
      { id: 'deferred', name: 'Deferred ticket income', kind: 'liability' },
      { id: 'cash', name: 'Cash', kind: 'asset' },
      { id: 'clearing', name: 'Card clearing', kind: 'asset', scoped: true },
    ],
  },
})
