// Payments: money moving, never tickets (Box office specification, parts 2 to 6). It requires Finance,
// where every payment, fee, payout and variance is posted, and reaches the owner of a payment only
// through the point payments.settlement, so it never imports Box office, a bar or anything else that
// sells. Cash and attested card ship with it, so a desk works on day one with no account anywhere.
import { z } from 'zod'
import { ability, code, defineAbilities, defineModule, defineRecords, defineSettings, event, job, point, setting, task } from '#kit'
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
    'session': { table: 'payments_sessions', owner: 'opened_by' },
  }),
  abilities: defineAbilities('payments', {
    'provider.manage': ability({ risk: 'privileged' }),
    'attempt.reconcile': ability({ on: 'payments.attempt', risk: 'privileged' }),
    'attempt.attest': ability(),
    'session.open': ability(),
    'session.view': ability({ on: 'payments.session', owner: 'grants' }),
    'session.close-any': ability({ on: 'payments.session', risk: 'privileged', owner: 'refuses', implies: ['session.view'] }),
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
      // An operational alarm for staff.
      'payments.attempt.unknown': event({ version: 1, payload: z.object({ attemptId: z.string() }), internal: true }),
      // A till cashed up. No subject: only the session's id.
      'payments.session.closed': event({ version: 1, payload: z.object({ sessionId: z.string() }), internal: false }),
    },
  },

  tasks: {
    // The backstop for a sale prepared and never paid.
    'payments.expire-intents': task({ every: '5m' }),
    // Asks providers about attempts still waiting, and marks unknown those past the time allowed.
    'payments.reconcile-attempts': task({ every: '5m' }),
    'payments.prune-webhooks': task({ dailyAt: '03:40' }),
  },

  jobs: {
    // One stored, verified webhook event. Retried while the provider has no answer.
    'payments.handle-webhook': job({ payload: z.object({ webhookEventId: z.string() }), retries: 8 }),
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
    'core.health-check': [{ id: 'payments.unknown-attempts', file: 'unknown-attempts' }],
  },
})
