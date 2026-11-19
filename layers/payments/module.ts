// Payments: money moving, never tickets (Box office specification, parts 2 to 6). It requires Finance,
// where every payment, fee, payout and variance is posted, and reaches the owner of a payment only
// through the point payments.settlement, so it never imports Box office, a bar or anything else that
// sells. Cash and attested card ship with it, so a desk works on day one with no account anywhere.
import { z } from 'zod'
import { ability, call, code, credentialDecl, defineAbilities, defineModule, defineRecords, defineSettings, event, job, point, setting, task } from '#kit'
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
    // Where the till opens a session when the device has not used one before: a core space's id.
    'sessions.default-space': setting.custom({ schema: z.string().min(1).max(40), unset: true, change, audience: 'staff' }), // not-policy: an id's length
    'sessions.close-when-quiet': setting.duration({ default: '2h', min: '15m', max: '12h', change, audience: 'staff' }),
    // The common providers the receipt box offers a typed name at (Matt, 17 November, first for tickets).
    'desk.email-domains': setting.list({ default: ['gmail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'icloud.com', 'yahoo.com', 'yahoo.co.uk', 'live.co.uk', 'btinternet.com'], of: 'text', maxLength: 253, change, audience: 'staff' }),
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
    // What prices a sale before it is written: Promotions. Nobody contributing means list prices.
    'payments.pricing': point({ kind: 'code', contract: 'pricing' }),
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
    // Ends till sessions quiet for payments.sessions.close-when-quiet.
    'payments.close-quiet-sessions': task({ every: '5m' }),
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
    // The receipts of a till sale once it is paid, each person's in a unit of its own. Retried for any not sent.
    'payments.till-receipts': job({ payload: z.object({ intentId: z.string() }), retries: 5 }),
  },

  // Provider keys are credentials (Matt, 17 November: keys are managed in the app, not in Cloudflare),
  // typed into each provider account on the Providers screen. A Worker secret of the same name is
  // used where none is saved. Stripe's are needed only once a Stripe account is added, SumUp's once a
  // SumUp account is.
  credentials: {
    PAYMENTS_STRIPE_SECRET_KEY: credentialDecl({ needed: 'when-used' }),
    PAYMENTS_STRIPE_WEBHOOK_SECRET: credentialDecl({ needed: 'when-used' }),
    PAYMENTS_STRIPE_PUBLISHABLE_KEY: credentialDecl({ needed: 'when-used' }),
    // SumUp's API key (the Cloud API only), and the affiliate app id and key that both the Cloud API's
    // reader checkout and the hand-off to the SumUp app carry.
    PAYMENTS_SUMUP_API_KEY: credentialDecl({ needed: 'when-used' }),
    PAYMENTS_SUMUP_AFFILIATE_KEY: credentialDecl({ needed: 'when-used' }),
    PAYMENTS_SUMUP_APP_ID: credentialDecl({ needed: 'when-used' }),
  },

  // The return address of a hand-off to the SumUp app is signed for its attempt. A key checks for a
  // while after it stops signing, longer than any seller takes to come back from the app.
  signing: [{ purpose: 'payments.handoff', rotateEvery: '90d', keepFor: '2d' }],

  contributes: {
    'finance.system-account': [
      { id: 'cash', name: 'Cash in tills', kind: 'asset' },
      { id: 'card-clearing', name: 'Card clearing', kind: 'asset', scoped: true },
      // Money taken some other way at the desk (a voucher, a bank transfer, an invoice): no card
      // machine pays it out, so it is kept apart from card clearing until the treasurer moves it.
      { id: 'other', name: 'Other payments taken', kind: 'asset' },
      { id: 'bank', name: 'Bank', kind: 'asset' },
      { id: 'provider-fees', name: 'Payment provider fees', kind: 'expense' },
      { id: 'cash-variance', name: 'Cash over and short', kind: 'expense' },
      { id: 'unfulfilled', name: 'Payments to return', kind: 'liability' },
    ],
    'payments.provider': [{ id: 'cash' }, { id: 'attested-card' }, { id: 'other' }, { id: 'stripe' }, { id: 'sumup' }, { id: 'sumup-handoff' }],
    // Payments' own part: guided setup's test payment.
    'payments.settlement': [{ id: 'payments' }],
    'finance.period-close-check': [{ id: 'payments.money-in-flight', file: 'money-in-flight' }],
    'core.health-check': [{ id: 'payments.unknown-attempts', file: 'unknown-attempts' }],
    // Asks for a provider's keys only once an account with that provider is added and lacks them.
    'core.credential-use': [{ id: 'payments.provider-keys', file: 'provider-keys' }],
    // What the policies say about paying (/policies): which card companies are really connected,
    // worked out from the provider accounts, so the privacy notice names them and no others.
    'core.policy-fact': [{ id: 'payments.card-providers', file: 'card-providers' }, { id: 'payments.stripe', file: 'stripe' }, { id: 'payments.sumup', file: 'sumup' }, { id: 'payments.cash', file: 'cash' }],
    'core.supplier': [
      { id: 'payments.stripe', name: 'Stripe', purpose: 'Takes card payments', when: 'fact="payments.stripe" is="true"', cookies: { when: 'Only on the payment page', purpose: 'To take your payment securely and prevent fraud' }, order: 20 },
      { id: 'payments.sumup', name: 'SumUp', purpose: 'Takes card payments', when: 'fact="payments.sumup" is="true"', cookies: { when: 'Only on the payment page', purpose: 'To take your payment securely and prevent fraud' }, order: 21 },
    ],
    'core.privacy-record': [
      { id: 'payments.payments', holds: 'Payments and refunds: the amount, the type of card and its last four digits', why: 'To match payments to orders and make refunds', basis: 'To carry out our contract with you, and a legal duty (tax and accounting law)', keptFor: 'For as long as tax and accounting law requires', order: 120 },
      { id: 'payments.till-receipts', holds: 'An email address you give at the till for your receipt, or your account if you are found there', why: 'To send you a receipt for what you paid', basis: 'To carry out our contract with you', keptFor: 'A typed address until the receipt is sent; the account with the payment', order: 121 },
    ],
    // The till's receipts: one for a whole sale, or one for each person of a sale split by item, to a
    // person found or an address typed. An owner may add one link, such as "Show my tickets", so a
    // till sale sends one email.
    'core.notification-type': [{
      id: 'payments.till-receipt',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      variables: { items: 'text' as const, amount: 'text' as const, method: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your receipt from {{ theatre }}',
          body: 'Thank you for your payment of **{{ amount }}** to {{ theatre }} ({{ method }}).\n\nYou paid for: {{ items }}.',
        },
      },
    }, {
      id: 'payments.till-receipt-link',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const],
      // The link is the owner's, such as a booking's tickets, which let their holder in, so it is sealed.
      variables: { items: 'text' as const, amount: 'text' as const, method: 'text' as const, linkText: 'text' as const, link: 'sealed' as const },
      wording: {
        'en-GB': {
          subject: 'Your receipt from {{ theatre }}',
          body: 'Thank you for your payment of **{{ amount }}** to {{ theatre }} ({{ method }}).\n\nYou paid for: {{ items }}.\n\n[{{ linkText }}]({{ link }})\n\nAnyone with the link can use what it shows, so only pass this email on to the people you are with.',
        },
      },
    }],
    // The tills on a performance's operating day, for Front of house's board and night report.
    'front-of-house.tonight-figure': [{ id: 'payments.tills', file: 'tills' }],
    'front-of-house.report-section': [{ id: 'payments.tills', file: 'tills' }],
    'core.tonight-figure': [{ id: 'payments.takings', file: 'takings' }],
    // The console's Money group (Box office specification, part 5). Finance adds its own screens there.
    'core.navigation': [
      { id: 'payments.attention', menu: 'console', group: 'money', section: 'everyday', to: '/console/payments/attention', icon: 'i-lucide-bell-ring', ability: 'payments.attempt.reconcile', order: 20, count: 'payments.attention' },
      { id: 'payments.refunds', menu: 'console', group: 'money', section: 'everyday', to: '/console/payments/refunds', icon: 'i-lucide-undo-2', ability: 'payments.refund.approve', order: 30, count: 'payments.refunds-waiting' },
      // Every session, with the seller's own above them; a seller who may not see everyone's sees only theirs.
      { id: 'payments.sessions', menu: 'console', group: 'money', section: 'everyday', to: '/console/payments/sessions', icon: 'i-lucide-receipt', ability: ['payments.session.view', 'payments.session.open'], order: 40 },
      { id: 'payments.providers', menu: 'admin', group: 'modules', to: '/admin/modules/payments/providers', icon: 'i-lucide-credit-card', ability: 'payments.provider.manage', order: 10 },
      // The combined till's tile on the Tonight hub.
      { id: 'payments.live-till', menu: 'live', to: '/live/till', icon: 'i-lucide-shopping-basket', ability: 'payments.session.open', order: 20 },
    ],
    // Titles and addresses for Payments' records, so the ledger can name where a posting came from.
    'core.record-resolver': [
      { id: 'payments.intent', file: 'intent' },
      { id: 'payments.attempt', file: 'attempt' },
      { id: 'payments.refund', file: 'refund' },
      { id: 'payments.session', file: 'session' },
      { id: 'payments.provider-account', file: 'provider-account' },
    ],
    'core.count': [
      { id: 'payments.attention', file: 'attention' },
      { id: 'payments.refunds-waiting', file: 'refunds-waiting' },
    ],
    // On the console home for whoever can act on them: payments that need settling, and refunds to approve.
    'core.home-card': [
      { id: 'payments.attention', home: 'console', ability: 'payments.attempt.reconcile', component: 'PaymentsAttentionCard', urgency: 'today', count: 'payments.attention' },
      { id: 'payments.refunds', home: 'console', ability: 'payments.refund.approve', component: 'PaymentsRefundsCard', urgency: 'today', count: 'payments.refunds-waiting' },
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
