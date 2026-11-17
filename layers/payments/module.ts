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
    'refunds.self-approve-up-to': setting.money({ default: 0, min: 0, max: 100000, change, audience: 'staff', onChange: 'confirm' }),
    'refunds.window': setting.duration({ default: '180d', min: '1d', max: '730d', change, audience: 'staff', onChange: 'confirm' }),
    'sessions.variance-needs-second-person': setting.money({ default: 500, min: 0, max: 100000, change, audience: 'staff', onChange: 'confirm' }),
    'sessions.default-float': setting.money({ default: 0, min: 0, max: 100000, change, audience: 'staff' }),
    'cash.enabled': setting.boolean({ default: false, change, audience: 'staff', onChange: 'confirm' }),
    'desk.attested-card': setting.boolean({ default: true, change, audience: 'staff', onChange: 'confirm' }),
    'retention.webhooks': setting.duration({ default: '90d', min: '7d', max: '730d', change, audience: 'staff', onChange: 'confirm' }),
    // For a test instance only: a provider account in test mode takes payment for real sales, which
    // then post to the ledger as live money would, so the whole journey can be tried with test cards.
    'test-mode.takes-sales': setting.boolean({ default: false, change, audience: 'staff', onChange: 'confirm' }),
  }),

  // R-37: every other group sits on /console/payments/settings, the module's own page; how long
  // webhook bodies are kept is upkeep, on the shared Advanced page.
  settingGroups: {
    'retention': { advanced: true },
    'test-mode': { advanced: true },
  },

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
    'refund.approve': ability({ on: 'payments.refund', risk: 'privileged', owner: 'refuses', implies: ['core.account.find'] }),
    'session.open': ability(),
    'session.view': ability({ on: 'payments.session', owner: 'grants', implies: ['core.account.find'] }),
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
    PAYMENTS_STRIPE_PUBLISHABLE_KEY: secret({ needed: 'when-used' }),
    // SumUp's API key (the Cloud API only), and the affiliate app id and key that both the Cloud API's
    // reader checkout and the hand-off to the SumUp app carry.
    PAYMENTS_SUMUP_API_KEY: secret({ needed: 'when-used' }),
    PAYMENTS_SUMUP_AFFILIATE_KEY: secret({ needed: 'when-used' }),
    PAYMENTS_SUMUP_APP_ID: secret({ needed: 'when-used' }),
  },

  // The return address of a hand-off to the SumUp app is signed for its attempt. A key checks for a
  // while after it stops signing, longer than any seller takes to come back from the app.
  signing: [{ purpose: 'payments.handoff', rotateEvery: '90d', keepFor: '2d' }],

  contributes: {
    'finance.system-account': [
      { id: 'cash', name: 'Cash in tills', kind: 'asset' },
      { id: 'card-clearing', name: 'Card clearing', kind: 'asset', scoped: true },
      { id: 'bank', name: 'Bank', kind: 'asset' },
      { id: 'provider-fees', name: 'Payment provider fees', kind: 'expense' },
      { id: 'cash-variance', name: 'Cash over and short', kind: 'expense' },
      { id: 'unfulfilled', name: 'Payments to return', kind: 'liability' },
    ],
    'payments.provider': [{ id: 'cash' }, { id: 'attested-card' }, { id: 'stripe' }, { id: 'sumup' }, { id: 'sumup-handoff' }],
    // Payments' own part: guided setup's test payment.
    'payments.settlement': [{ id: 'payments' }],
    'finance.period-close-check': [{ id: 'payments.money-in-flight', file: 'money-in-flight' }],
    'core.health-check': [{ id: 'payments.unknown-attempts', file: 'unknown-attempts' }],
    // The tills on a performance's operating day, for Front of house's board and night report.
    'front-of-house.tonight-figure': [{ id: 'payments.tills', file: 'tills' }],
    'front-of-house.report-section': [{ id: 'payments.tills', file: 'tills' }],
    // The console's Money group (Box office specification, part 5). Finance adds its own screens there.
    'core.navigation': [
      // The till is a live screen (selling proposal); the Money group links to it.
      { id: 'payments.open-till', menu: 'console', group: 'money', section: 'everyday', to: '/live/till', icon: 'i-lucide-shopping-basket', ability: 'payments.session.open', order: 5 },
      { id: 'payments.session', menu: 'console', group: 'money', section: 'everyday', to: '/console/payments/session', icon: 'i-lucide-calculator', ability: 'payments.session.open', order: 10 },
      { id: 'payments.attention', menu: 'console', group: 'money', section: 'everyday', to: '/console/payments/attention', icon: 'i-lucide-bell-ring', ability: 'payments.attempt.reconcile', order: 20, count: 'payments.attention' },
      { id: 'payments.refunds', menu: 'console', group: 'money', section: 'everyday', to: '/console/payments/refunds', icon: 'i-lucide-undo-2', ability: 'payments.refund.approve', order: 30, count: 'payments.refunds-waiting' },
      { id: 'payments.sessions', menu: 'console', group: 'money', section: 'everyday', to: '/console/payments/sessions', icon: 'i-lucide-receipt', ability: 'payments.session.view', order: 40 },
      { id: 'payments.providers', menu: 'console', group: 'money', section: 'setup', to: '/console/payments/providers', icon: 'i-lucide-credit-card', ability: 'payments.provider.manage', order: 10 },
      // The combined till's tile on the Tonight hub.
      { id: 'payments.live-till', menu: 'live', to: '/live/till', icon: 'i-lucide-shopping-basket', ability: 'payments.session.open', order: 20 },
    ],
    'core.count': [
      { id: 'payments.attention', file: 'attention' },
      { id: 'payments.refunds-waiting', file: 'refunds-waiting' },
    ],
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
