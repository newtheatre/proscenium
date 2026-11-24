// Budgets and claims (third round, spec 8). The plan first: categories mapped to expense accounts, and
// budgets for a production, a department and year, a season or a general purpose, approved by someone
// other than who proposed them, with spent read from Finance. Requests and claims follow; this file
// declares only what is built.
import { ability, defineAbilities, defineModule, defineRecords, event } from '#kit'
import { z } from 'zod'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'budgets',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  switchable: true,
  requires: ['finance'],

  records: defineRecords('budgets', {
    budget: { table: 'budgets_budgets' },
    line: { table: 'budgets_lines', parent: 'budgets.budget' },
    category: { table: 'budgets_categories' },
  }),
  abilities: defineAbilities('budgets', {
    // Aggregates only: no claimant is named under it.
    'budget.view': ability({ on: 'budgets.budget' }),
    'budget.manage': ability({ implies: ['budget.view'] }),
    'budget.approve': ability({ risk: 'privileged', implies: ['budget.view'] }),
    'category.manage': ability({}),
  }),

  tables,

  events: {
    announces: {
      'budgets.budget.approved': event({ version: 1, payload: z.object({ budgetId: z.string(), scope: z.enum(['production', 'department', 'season', 'general']), productionId: z.string().optional(), totalMinor: z.number().int(), currency: z.enum(['GBP', 'EUR', 'USD']) }), internal: false }),
      'budgets.budget.closed': event({ version: 1, payload: z.object({ budgetId: z.string() }), internal: false }),
    },
    listens: { 'core.module.enabled': 'categories' },
  },

  contributes: {
    'finance.system-account': [
      { id: 'claims-payable', name: 'Expense claims to pay', kind: 'liability' },
      { id: 'expenses', name: 'General expenses', kind: 'expense' },
    ],
    'core.record-resolver': [{ id: 'budgets.budget', file: 'budget' }, { id: 'budgets.line', file: 'line' }, { id: 'budgets.category', file: 'category' }],
    'core.navigation': [
      { id: 'budgets.budgets', menu: 'console', group: 'money', section: 'everyday', to: '/console/budgets', icon: 'i-lucide-piggy-bank', ability: 'budgets.budget.view', order: 85 },
      { id: 'budgets.categories', menu: 'admin', group: 'modules', to: '/admin/modules/budgets/categories', icon: 'i-lucide-tags', ability: 'budgets.category.manage', order: 35 },
    ],
  },
})
