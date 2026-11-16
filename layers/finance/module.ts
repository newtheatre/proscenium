// Finance: the ledger. It stands alone and requires nothing; any module that handles money requires
// it (Box office specification, parts 2 to 6). Finance ships no accounts of its own: each module
// declares the accounts it posts to through finance.system-account and Finance makes them, locked.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettingRules, defineSettings, event, point, setting } from '#kit'
import { tables } from './server/db/schema'

const change = 'finance.settings.manage'
const KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

export default defineModule({
  id: 'finance',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',

  settings: defineSettings('finance', {
    'periods.length': setting.choice({ default: 'month', options: ['month', 'quarter'], change, audience: 'staff' }),
    // A month and a day. Days stop at 28 so that every period starts on the same day of the month.
    'year.starts': setting.custom({ schema: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|1\d|2[0-8])$/), default: '08-01', change, audience: 'staff' }),
    'tax.registered': setting.boolean({ default: false, change, audience: 'staff' }),
  }),
  // Tax on sales is not supported in the first release.
  settingRules: defineSettingRules('finance', [{ id: 'tax-not-yet', check: s => s['tax.registered'] !== true }]),

  records: defineRecords('finance', {
    account: { table: 'finance_accounts' },
    posting: { table: 'finance_postings' },
    period: { table: 'finance_periods' },
  }),
  abilities: defineAbilities('finance', {
    'ledger.view': ability({}),
    'posting.correct': ability({ risk: 'privileged', implies: ['ledger.view'] }),
    'account.manage': ability({ risk: 'privileged' }),
    'period.close': ability({ on: 'finance.period', risk: 'privileged', implies: ['ledger.view'] }),
    'period.reopen': ability({ on: 'finance.period', risk: 'privileged' }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  points: {
    // A ledger account a module posts to. The contribution's id is the account's key, so Box office's
    // { id: 'ticket-income' } is the account box-office.ticket-income. A scoped account (one per
    // record, such as a clearing account per provider account) is made by its module when the record
    // is, with ensureScopedAccount, rather than when the module is switched on.
    'finance.system-account': point({
      kind: 'data',
      schema: z.object({
        id: z.string().regex(KEY),
        name: z.string().min(1).max(80), // not-policy: an account name's bounds
        kind: z.enum(['asset', 'liability', 'income', 'expense', 'equity']),
        taxCode: z.string().optional(),
        scoped: z.boolean().optional(),
      }).strict(),
    }),
    // What stops a period being closed, from modules that hold the facts (open till sessions, money
    // taken but not settled). Read only; never commits.
    'finance.period-close-check': point({ kind: 'code', contract: 'period-close-check' }),
  },

  events: {
    announces: {
      'finance.period.closed': event({ version: 1, payload: z.object({ periodId: z.string() }), internal: false }),
      'finance.period.reopened': event({ version: 1, payload: z.object({ periodId: z.string() }), internal: false }),
    },
    listens: { 'core.module.enabled': 'create-accounts' },
  },

  contributes: {
    'core.vocabulary': [{
      id: 'finance.reopen-reason',
      label: 'Reasons for reopening a period',
      terms: [
        { slug: 'late-income', label: 'Late income' },
        { slug: 'missing-expense', label: 'Missing expense' },
        { slug: 'correction', label: 'Correction' },
        { slug: 'auditor-request', label: 'Auditor\'s request' },
        { slug: 'other', label: 'Other' },
      ],
    }],
    'core.health-check': [{ id: 'finance.unsealed-postings', file: 'unsealed-postings' }],
    // The console's Money group (Box office specification, part 5), beside Payments' screens.
    'core.navigation': [
      { id: 'finance.ledger', menu: 'console', group: 'money', section: 'everyday', to: '/console/finance/ledger', icon: 'i-lucide-book-open', ability: 'finance.ledger.view', order: 50 },
      { id: 'finance.periods', menu: 'console', group: 'money', section: 'everyday', to: '/console/finance/periods', icon: 'i-lucide-calendar-check', ability: 'finance.period.close', order: 60 },
      { id: 'finance.accounts', menu: 'console', group: 'money', section: 'setup', to: '/console/finance/accounts', icon: 'i-lucide-list-tree', ability: 'finance.account.manage', order: 20 },
    ],
  },

  presets: {
    'amateur-company': { settings: { 'finance.year.starts': '01-01' } },
  },
})
