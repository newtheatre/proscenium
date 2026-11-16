// Payments: money moving, never tickets (Box office specification, parts 2 to 6). It requires Finance,
// where every payment, fee, payout and variance is posted, and reaches the owner of a payment only
// through the point payments.settlement, so it never imports Box office, a bar or anything else that
// sells. Cash and attested card ship with it, so a desk works on day one with no account anywhere.
import { z } from 'zod'
import { ability, call, code, defineAbilities, defineModule, defineRecords, defineSettings, event, job, point, secret, setting, task } from '#kit'
import { tables } from './server/db/schema'

const change = 'payments.settings.manage'
const owner = z.object({ moduleId: code(), recordId: z.string() })
const owners = z.array(owner)

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
    'refund': { table: 'payments_refunds', owner: 'requested_by' },
    'session': { table: 'payments_sessions', owner: 'opened_by' },
  }),
  abilities: defineAbilities('payments', {
    'provider.manage': ability({ risk: 'privileged' }),
    'attempt.reconcile': ability({ on: 'payments.attempt', risk: 'privileged' }),
    'attempt.attest': ability(),
    'refund.request': ability(),
    'refund.approve': ability({ on: 'payments.refund', risk: 'privileged', owner: 'refuses' }),
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
      'payments.refund.requested': event({ version: 1, payload: z.object({ refundId: z.string(), partId: z.string(), owner }), internal: true }),
      'payments.refund.failed': event({ version: 1, payload: z.object({ refundId: z.string(), partId: z.string(), owner }), internal: true }),
      // Money left: the counterpart of a sale, with ids only.
      'payments.refund.succeeded': event({ version: 1, payload: z.object({ refundId: z.string(), partId: z.string(), owner }), internal: false }),
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

  calls: {
    // Asking a provider to start a payment. The reconcile task asks after one with no answer as well.
    'payments.start-payment': call({ reconcileAfter: '3m' }),
  },

  jobs: {
    // One stored, verified webhook event. Retried while the provider has no answer.
    'payments.handle-webhook': job({ payload: z.object({ webhookEventId: z.string() }), retries: 8 }),
    // Asks the provider to send one approved refund, with its idempotency key. Retried while pending.
    'payments.send-refund': job({ payload: z.object({ refundId: z.string() }), retries: 8 }),
  },

  // Provider keys are Worker secrets in the first release (Matt's question 3). Stripe's are needed
  // only once a Stripe account is added, and SumUp's once a SumUp account is.
  secrets: {
    PAYMENTS_STRIPE_SECRET_KEY: secret({ needed: 'when-used' }),
    PAYMENTS_STRIPE_WEBHOOK_SECRET: secret({ needed: 'when-used' }),
    // SumUp's API key, and the affiliate app id and key every reader checkout carries.
    PAYMENTS_SUMUP_API_KEY: secret({ needed: 'when-used' }),
    PAYMENTS_SUMUP_AFFILIATE_KEY: secret({ needed: 'when-used' }),
    PAYMENTS_SUMUP_APP_ID: secret({ needed: 'when-used' }),
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
    'payments.provider': [{ id: 'cash' }, { id: 'attested-card' }, { id: 'stripe' }, { id: 'sumup' }],
    // Payments' own part: guided setup's test payment.
    'payments.settlement': [{ id: 'payments' }],
    'finance.period-close-check': [{ id: 'payments.money-in-flight', file: 'money-in-flight' }],
    'core.health-check': [{ id: 'payments.unknown-attempts', file: 'unknown-attempts' }],
    'core.vocabulary': [{
      id: 'payments.refund-decline-reason',
      label: 'Reasons for declining a refund',
      terms: [
        { slug: 'outside-policy', label: 'Outside the refund policy' },
        { slug: 'already-refunded', label: 'Already refunded another way' },
        { slug: 'duplicate', label: 'Asked for twice' },
        { slug: 'other', label: 'Other' },
      ],
    }],
  },
})
