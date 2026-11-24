// Budgets and claims (third round, spec 8). The plan first: categories mapped to expense accounts, and
// budgets for a production, a department and year, a season or a general purpose, approved by someone
// other than who proposed them, with spent read from Finance. Requests and claims follow; this file
// declares only what is built.
import { ability, defineAbilities, defineFacts, defineModule, defineRecords, defineSettings, event, factDecl, setting, task } from '#kit'
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
    'budget': { table: 'budgets_budgets' },
    'line': { table: 'budgets_lines', parent: 'budgets.budget' },
    'category': { table: 'budgets_categories' },
    'request': { table: 'budgets_spending_requests', parent: 'budgets.line' },
    'claim': { table: 'budgets_claims' },
    'claim-item': { table: 'budgets_claim_items', parent: 'budgets.claim' },
  }),
  abilities: defineAbilities('budgets', {
    // Aggregates only: no claimant is named under it.
    'budget.view': ability({ on: 'budgets.budget' }),
    'budget.manage': ability({ implies: ['budget.view'] }),
    'budget.approve': ability({ risk: 'privileged', implies: ['budget.view'] }),
    // Approves spending on a budget's lines; held through the fact holder-of (BC-14).
    'budget.hold': ability({ on: 'budgets.budget', implies: ['budget.view'] }),
    'category.manage': ability({}),
    'settings.manage': ability({ risk: 'privileged' }),
    // Ask to spend, and see one's own requests (BC-15).
    'request.make': ability({}),
    // Make, edit, submit and withdraw one's own claims (BC-19); the service shows only one's own.
    'claim.make': ability({}),
    // Every claim with its claimant and receipts; each read is audited (BC-21).
    'claim.view-all': ability({ risk: 'privileged', fresh: false, audit: 'read' }),
    // The treasurer: decides over budget (C3) and voids approved claims (BC-25).
    'claim.approve-any': ability({ risk: 'privileged', implies: ['claim.view-all'] }),
  }),

  // Read from budgets_holders at each request (decision 0009): authority from a fact, not a standing grant.
  facts: defineFacts('budgets', {
    'holder-of': factDecl({ on: 'budgets.budget', defaults: ['budgets.budget.hold'] }),
  }),

  settings: defineSettings('budgets', {
    // After a production's last performance, its budget is offered for closing.
    'close.after': setting.duration({ default: '60d', min: '7d', max: '1y', change: 'budgets.settings.manage', audience: 'staff' }),
    // An approved request that nothing has spent stops counting as committed after this.
    'requests.lapse-after': setting.duration({ default: '60d', min: '7d', max: '1y', change: 'budgets.settings.manage', audience: 'staff' }),
    // How long a decided request keeps its requester and description. Shortening it erases at the next run.
    'retention.requests': setting.duration({ default: '2y', min: '6mo', max: '7y', change: 'budgets.settings.manage', audience: 'public', quotable: true, onChange: 'confirm' }),
    // An item without a receipt needs a reason; off, neither is asked.
    'claims.receipt-required': setting.boolean({ default: true, change: 'budgets.settings.manage', audience: 'public', quotable: true }),
    // Items spent longer ago than this are marked late for the approver; never refused.
    'claims.late-after': setting.duration({ default: '90d', min: '7d', max: '2y', change: 'budgets.settings.manage', audience: 'public', quotable: true }),
    // A claim above this with no request is marked "not asked first". Unset: never marked.
    'requests.expected-above': setting.money({ unset: true, min: 100, max: 1000000, change: 'budgets.settings.manage', audience: 'public', quotable: true }),
    // How long a claim, its items and receipts are kept after its last event. Shortening it erases at the next run.
    'retention.claims': setting.duration({ default: '6y', min: '2y', max: '10y', change: 'budgets.settings.manage', audience: 'staff', onChange: 'confirm' }),
  }),

  tasks: {
    // Lapses approved requests past their date, and anonymises decided ones past retention.
    'budgets.sweep-requests': task({ dailyAt: '04:50' }),
  },

  tables,

  events: {
    announces: {
      'budgets.budget.approved': event({ version: 1, payload: z.object({ budgetId: z.string(), scope: z.enum(['production', 'department', 'season', 'general']), productionId: z.string().optional(), totalMinor: z.number().int(), currency: z.enum(['GBP', 'EUR', 'USD']) }), internal: false }),
      'budgets.budget.closed': event({ version: 1, payload: z.object({ budgetId: z.string() }), internal: false }),
      'budgets.claim.decided': event({ version: 1, payload: z.object({ claimId: z.string(), decision: z.enum(['approved', 'returned', 'declined', 'voided']), amountMinor: z.number().int() }), internal: true }),
      'budgets.request.decided': event({ version: 1, payload: z.object({ requestId: z.string(), decision: z.enum(['approved', 'declined']), amountMinor: z.number().int() }), internal: true }),
    },
    listens: { 'core.module.enabled': 'categories' },
  },

  contributes: {
    'finance.system-account': [
      { id: 'claims-payable', name: 'Expense claims to pay', kind: 'liability' },
      { id: 'expenses', name: 'General expenses', kind: 'expense' },
    ],
    // The Budget tab and fact on a production's page (BC-11).
    'core.record-tab': [{ id: 'budgets.production', record: 'core.production', ability: 'budgets.budget.view', component: 'BudgetsProductionTab', order: 40 }],
    'core.record-fact': [{ id: 'budgets.production', record: 'core.production', ability: 'budgets.budget.view', component: 'BudgetsProductionFact', order: 40 }],
    'core.erasure-handler': [{ id: 'budgets', file: 'budgets' }],
    'core.record-resolver': [{ id: 'budgets.budget', file: 'budget' }, { id: 'budgets.line', file: 'line' }, { id: 'budgets.category', file: 'category' }, { id: 'budgets.request', file: 'request' }, { id: 'budgets.claim', file: 'claim' }],
    // Receipts: images and PDFs on an item, read by its claimant and its approvers (BC-19, BC-21).
    'core.file-slot': [{ id: 'budgets.receipt', owner: 'budgets.claim-item', ability: 'budgets.claim.view-all', many: true, accepts: ['png' as const, 'jpeg' as const, 'webp' as const, 'pdf' as const], limit: 'core.files.document-limit', access: 'record' as const, textClass: 'personal' as const, clean: true }],
    'core.file-access': [{ id: 'budgets.claim-item', file: 'claim-item' }],
    // The theatre owes the person money, or has their claim still to decide (spec part 2).
    'core.erasure-hold': [{ id: 'budgets.claims', file: 'claims' }],
    'core.notification-type': [
      {
        id: 'budgets.request-to-approve',
        category: 'transactional' as const,
        side: 'members' as const,
        channels: ['email' as const, 'inbox' as const],
        variables: { person: 'text' as const, amount: 'text' as const, line: 'text' as const, budget: 'text' as const, link: 'text' as const },
        link: '/console/budgets/approvals',
        wording: {
          'en-GB': {
            subject: '{{ person }} asks to spend {{ amount }}',
            body: '{{ person }} asks to spend **{{ amount }}** on {{ line }}, in the budget {{ budget }}.\n\n[Approve or decline]({{ link }})',
          },
        },
      },
      {
        id: 'budgets.claim-to-approve',
        category: 'transactional' as const,
        side: 'members' as const,
        channels: ['email' as const, 'inbox' as const],
        variables: { person: 'text' as const, amount: 'text' as const, number: 'text' as const, title: 'text' as const, link: 'text' as const },
        link: '/console/budgets/approvals',
        wording: {
          'en-GB': {
            subject: 'Claim {{ number }} from {{ person }}: {{ amount }}',
            body: '{{ person }} claims **{{ amount }}** for {{ title }} (claim {{ number }}).\n\n[Review the claim]({{ link }})',
          },
        },
      },
      {
        id: 'budgets.claim-decided',
        category: 'transactional' as const,
        side: 'members' as const,
        channels: ['email' as const, 'inbox' as const],
        variables: { number: 'text' as const, title: 'text' as const, decision: 'text' as const, amount: 'text' as const, note: 'text' as const, link: 'text' as const },
        link: '/members/expenses',
        wording: {
          'en-GB': {
            subject: 'Your claim {{ number }} was {{ decision }}',
            body: 'Your claim {{ number }} for {{ title }} was {{ decision }}: **{{ amount }}**.\n\n{{ note }}\n\n[See your claim]({{ link }})',
          },
        },
      },
      {
        id: 'budgets.request-decided',
        category: 'transactional' as const,
        side: 'members' as const,
        channels: ['email' as const, 'inbox' as const],
        variables: { amount: 'text' as const, line: 'text' as const, decision: 'text' as const, note: 'text' as const, link: 'text' as const },
        link: '/members/expenses',
        wording: {
          'en-GB': {
            subject: 'Your request to spend {{ amount }} was {{ decision }}',
            body: 'Your request to spend **{{ amount }}** on {{ line }} was {{ decision }}.\n\n{{ note }}\n\n[See your requests]({{ link }})',
          },
        },
      },
    ],
    'core.count': [{ id: 'budgets.approvals', file: 'approvals' }],
    'core.navigation': [
      { id: 'budgets.budgets', menu: 'console', group: 'money', section: 'everyday', to: '/console/budgets', icon: 'i-lucide-piggy-bank', ability: 'budgets.budget.view', order: 85 },
      // Shown to whoever has a request waiting on them: holders hold budgets one by one, so no ability names them all.
      { id: 'budgets.approvals', menu: 'console', group: 'money', section: 'everyday', to: '/console/budgets/approvals', icon: 'i-lucide-inbox', order: 86, count: 'budgets.approvals', hideEmpty: true },
      { id: 'budgets.expenses', menu: 'members', to: '/members/expenses', icon: 'i-lucide-receipt', ability: ['budgets.claim.make', 'budgets.request.make'], order: 40 },
      { id: 'budgets.categories', menu: 'admin', group: 'modules', to: '/admin/modules/budgets/categories', icon: 'i-lucide-tags', ability: 'budgets.category.manage', order: 35 },
    ],
  },
})
