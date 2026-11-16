// Payments: money moving, never tickets (Box office specification, parts 2 to 6). It requires Finance,
// where every payment, fee, payout and variance is posted, and reaches the owner of a payment only
// through the point payments.settlement, so it never imports Box office, a bar or anything else that
// sells. Cash and attested card ship with it, so a desk works on day one with no account anywhere.
import { z } from 'zod'
import { ability, code, defineAbilities, defineModule, defineRecords, defineSettings, event, point, setting, task } from '#kit'
import { tables } from './server/db/schema'

const change = 'payments.settings.manage'
const owners = z.array(z.object({ moduleId: code(), recordId: z.string() }))

export default defineModule({
  id: 'payments',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['finance'],
  uses: ['front-of-house'],

  settings: defineSettings('payments', {
    'attempts.answer-within': setting.duration({ default: '3m', min: '1m', max: '30m', change, audience: 'staff' }),
    'attempts.alert-unknown-after': setting.duration({ default: '60m', min: '5m', max: '48h', change, audience: 'staff' }),
    'refunds.self-approve-up-to': setting.money({ default: 0, min: 0, max: 100000, change, audience: 'staff' }),
    'refunds.window': setting.duration({ default: '180d', min: '1d', max: '730d', change, audience: 'staff' }),
    'sessions.variance-needs-second-person': setting.money({ default: 500, min: 0, max: 100000, change, audience: 'staff' }),
    'sessions.default-float': setting.money({ default: 0, min: 0, max: 100000, change, audience: 'staff' }),
    'cash.enabled': setting.boolean({ default: true, change, audience: 'staff' }),
    'desk.attested-card': setting.boolean({ default: true, change, audience: 'staff' }),
    'retention.webhooks': setting.duration({ default: '90d', min: '7d', max: '730d', change, audience: 'staff' }),
  }),

  records: defineRecords('payments', {
    'provider-account': { table: 'payments_provider_accounts' },
    'intent': { table: 'payments_intents' },
    'attempt': { table: 'payments_attempts' },
    'refund': { table: 'payments_refunds' },
    'session': { table: 'payments_sessions' },
  }),
  abilities: defineAbilities('payments', {
    'provider.manage': ability({ risk: 'privileged' }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  points: {
    'payments.provider': point({ kind: 'code', contract: 'provider' }),
    'payments.settlement': point({ kind: 'code', contract: 'settlement' }),
    'payments.desk-basket': point({ kind: 'code', contract: 'desk-basket' }),
  },

  events: {
    announces: {
      'payments.intent.succeeded': event({ version: 1, payload: z.object({ intentId: z.string(), owners }), internal: true }),
      'payments.intent.unfulfilled': event({ version: 1, payload: z.object({ intentId: z.string(), owners }), internal: true }),
      'payments.intent.expired': event({ version: 1, payload: z.object({ intentId: z.string(), owners }), internal: true }),
    },
  },

  tasks: {
    // The backstop for a sale prepared and never paid.
    'payments.expire-intents': task({ every: '5m' }),
  },

  contributes: {
    'finance.system-account': [
      { id: 'cash', name: 'Cash in tills', kind: 'asset' },
      { id: 'card-clearing', name: 'Card clearing', kind: 'asset', scoped: true },
      { id: 'bank', name: 'Bank', kind: 'asset' },
      { id: 'provider-fees', name: 'Payment provider fees', kind: 'expense' },
      { id: 'cash-variance', name: 'Cash over and short', kind: 'expense' },
      { id: 'unfulfilled', name: 'Payments to return', kind: 'liability' },
    ],
    'payments.provider': [{ id: 'cash' }, { id: 'attested-card' }],
    'finance.period-close-check': [{ id: 'payments.money-in-flight', file: 'money-in-flight' }],
  },
})
