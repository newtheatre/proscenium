// Box office: what is on sale, who holds which seats, orders and tickets (Box office specification,
// parts 2 to 6). It requires Payments, which collects and refunds, and Finance, where sales are
// posted. It names no module that provides a member price: that is a requirement reference checked
// through the kit. This file grows with the build; it declares only what the code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, event, job, point, setting, task } from '#kit'
import { tables } from './server/db/schema'

const change = 'box-office.settings.manage'
const performance = z.object({ performanceId: z.string() })

export default defineModule({
  id: 'box-office',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['payments', 'finance'],
  // Form builder joins this list with the checkout questions (R-17), once its module id exists.
  uses: ['front-of-house', 'communications'],

  settings: defineSettings('box-office', {
    'baskets.hold-for': setting.duration({ default: '10m', min: '2m', max: '60m', change, audience: 'public', quotable: true }),
    'baskets.pay-within': setting.duration({ default: '15m', min: '5m', max: '60m', change, audience: 'public' }),
    'orders.desk-seat-cap': setting.integer({ default: 30, min: 1, max: 500, change, audience: 'staff' }),
    'orders.seat-cap': setting.integer({ default: 8, min: 1, max: 50, change, audience: 'public', quotable: true }),
    // How long after curtain the desk may still sell, for latecomers.
    'sales.desk-until-after': setting.duration({ default: '30m', min: '0m', max: '4h', change, audience: 'staff' }),
    // The email providers the till's buyer box offers after a typed name ("Use sam@gmail.com").
    'sales.desk-email-domains': setting.list({ default: ['gmail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'icloud.com', 'yahoo.com', 'yahoo.co.uk', 'live.co.uk', 'btinternet.com'], of: 'text', maxLength: 253, change, audience: 'staff' }),
    // Show "N seats left" only at or under this many; 0 never shows it.
    'availability.show-remaining-under': setting.integer({ default: 20, min: 0, max: 1000, change, audience: 'public' }),
    'sales.close-before': setting.duration({ default: '0m', min: '0m', max: '7d', change, audience: 'public', quotable: true }),
    // What is in force is `reserve` whenever no online payment provider is connected, whatever this says.
    'checkout.payment-timing': setting.choice({ default: 'pay-now', options: ['pay-now', 'reserve', 'buyer-chooses'], change, audience: 'public', onChange: 'confirm' }),
    'reservations.confirm-email': setting.boolean({ default: true, change, audience: 'public' }),
    'reservations.max-tickets-per-order': setting.integer({ default: 8, min: 1, max: 50, change, audience: 'public', quotable: true }),
    'reservations.max-tickets-per-person': setting.integer({ default: 8, min: 1, max: 50, change, audience: 'public', quotable: true }),
    'reservations.release-before': setting.duration({ unset: true, min: '0m', max: '24h', change, audience: 'public', quotable: true, onChange: 'confirm' }),
    // Buyers cancelling their own paid tickets from the booking link; shipped off (Matt, question 6).
    'cancellations.by-buyer': setting.boolean({ default: false, change, audience: 'public', quotable: true, onChange: 'confirm' }),
    'cancellations.until-before': setting.duration({ default: '24h', min: '0m', max: '30d', change, audience: 'public', quotable: true }),
    // Kept from each ticket when staff refund less the fee, and on every buyer's cancellation.
    'cancellations.fee': setting.money({ default: 0, min: 0, max: 5000, change, audience: 'public', quotable: true, onChange: 'confirm' }),
    // Off, a request for complimentary tickets is issued at once, with no approver (Matt, 2026-11-17).
    'comps.needs-approval': setting.boolean({ default: true, change, audience: 'staff', onChange: 'confirm' }),
    'comps.per-request': setting.integer({ default: 4, min: 1, max: 50, change, audience: 'staff' }),
    // Unset means no cap on approved complimentary tickets for one performance.
    'comps.per-performance': setting.integer({ unset: true, min: 0, max: 1000, change, audience: 'staff' }),
    // The theatre's usual ticket preset, which a new show's tickets start from (show walkthrough, decision 2).
    'presets.usual': setting.custom({ schema: z.string().regex(/^tps_[2-7a-z]{26}$/), unset: true, change: 'box-office.pricing.manage', audience: 'staff' }),
    'retention.holds': setting.duration({ default: '90d', min: '0d', max: '3650d', change, audience: 'staff', onChange: 'confirm' }),
  }),

  records: defineRecords('box-office', {
    'order': { table: 'box_office_orders', owner: 'account_id' },
    'ticket-type': { table: 'box_office_ticket_types' },
    'ticket-preset': { table: 'box_office_ticket_presets' },
    'promo-code': { table: 'box_office_promo_codes' },
    // The requester owns the request; a grant on a performance or its production reaches it.
    'comp-request': { table: 'box_office_comp_requests', parent: 'core.performance', owner: 'requested_by' },
  }),
  abilities: defineAbilities('box-office', {
    'performance.manage': ability({ on: 'core.performance' }),
    'performance.exceed-venue': ability({ on: 'core.performance', risk: 'privileged' }),
    'pricing.manage': ability({ on: 'core.production' }),
    // Selling a ticket type with a requirement to someone the seller has checked by hand, such as a
    // member not yet recorded. Audited with the seller; the online buyer never has it.
    'ticket-type.override-requirement': ability({ on: 'core.performance' }),
    // Seeing orders includes finding them by the buyer's name or address.
    'order.view': ability({ on: 'box-office.order', owner: 'grants', implies: ['core.account.find'] }),
    'order.sell': ability({ on: 'core.performance', implies: ['order.view'] }),
    'order.take-payment': ability({ on: 'box-office.order', implies: ['order.view'] }),
    'order.release': ability({ on: 'box-office.order', implies: ['order.view'] }),
    // Cancelling does not imply refunding: staff with only the first cancel with no refund.
    'order.cancel': ability({ on: 'box-office.order', risk: 'privileged', owner: 'refuses', implies: ['order.view'] }),
    // Exchanging a paid ticket for a cheaper one also needs order.refund, for the difference.
    'order.exchange': ability({ on: 'box-office.order', owner: 'refuses', implies: ['order.view'] }),
    'order.refund': ability({ on: 'box-office.order', risk: 'privileged', owner: 'refuses', implies: ['order.view'] }),
    // The door finds a booking by the buyer's name as well as by its reference.
    'ticket.admit': ability({ on: 'core.performance', implies: ['core.account.find'] }),
    // Sales reports, by grant on a production for a visiting company's manager.
    'report.view': ability({ on: 'core.production' }),
    'report.export': ability({ on: 'core.production', implies: ['report.view'] }),
    // Asking for complimentary tickets names who they are for, by address.
    'comp.request': ability({ on: 'core.performance' }),
    // Approving issues the tickets. Never your own request.
    'comp.approve': ability({ on: 'box-office.comp-request', risk: 'privileged', owner: 'refuses' }),
    // Making, limiting and retiring promo codes (BO-17).
    'promo.manage': ability({}),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  // Door codes are signed so a device can check one with no connection. A key must outlast the
  // longest-lived thing signed under it, and a membership card can run for three years.
  signing: [{ purpose: 'box-office.door-code', rotateEvery: '90d', keepFor: '1460d' }],

  points: {
    // Another kind of code the door reads, such as a membership card. Signed here, under the same
    // purpose, so no other module handles a key; a scan of one shows what it says and admits nobody.
    'box-office.door-code': point({ kind: 'code', contract: 'door-code' }),
    // A ticket type a module needs, such as a companion ticket for the access scheme or a member
    // price. Box office makes it and keeps it in step: the module owns its kind, its requirements
    // and whether it needs a paid ticket beside it, and people only rename, order, retire and price it.
    'box-office.ticket-type': point({
      kind: 'data',
      schema: z.object({
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        name: z.string().min(1).max(60), // not-policy: as long as a name a person may type
        kind: z.enum(['standard', 'concession', 'companion', 'complimentary']),
        requirementRefs: z.array(z.string().min(3)).max(10).optional(), // not-policy: a short list of alternatives
        needsPaidTicket: z.boolean().optional(),
        maxPerHolder: z.number().int().min(1).max(50).optional(), // not-policy: the order cap's own ceiling
        recheckAtEntry: z.boolean().optional(),
        proofNote: z.string().max(120).optional(), // not-policy: one line
        sort: z.number().int().min(0).optional(),
      }).strict(),
    }),
  },

  events: {
    announces: {
      // Sale state is public: useful to a website or a listings feed.
      'box-office.performance.opened': event({ version: 1, payload: performance, internal: false }),
      'box-office.performance.paused': event({ version: 1, payload: performance, internal: false }),
      // The sales feed an outside system most plausibly wants. No person is named in either.
      'box-office.order.reserved': event({ version: 1, payload: z.object({ orderId: z.string(), performanceIds: z.array(z.string()) }), internal: false }),
      'box-office.order.confirmed': event({ version: 1, payload: z.object({ orderId: z.string(), performanceIds: z.array(z.string()) }), internal: false }),
      // An abandoned basket or an unpaid order is noise outside, and a trace of someone who did not buy.
      'box-office.order.expired': event({ version: 1, payload: z.object({ orderId: z.string() }), internal: true }),
      'box-office.order.exchanged': event({ version: 1, payload: z.object({ orderId: z.string(), cancellationId: z.string() }), internal: false }),
      'box-office.comp-request.requested': event({ version: 1, payload: z.object({ requestId: z.string() }), internal: true }),
      'box-office.comp-request.decided': event({ version: 1, payload: z.object({ requestId: z.string(), state: z.enum(['issued', 'declined', 'withdrawn']) }), internal: true }),
      'box-office.order.cancelled': event({ version: 1, payload: z.object({ orderId: z.string(), cancellationId: z.string() }), internal: false }),
    },
    // The decision recorded on the Bulk cancellation screen is carried out when the core's change goes through (R-11).
    listens: {
      // Makes the ticket types a module declares when it is switched on, Box office's own included.
      'core.module.enabled': 'managed-ticket-types',
      'core.performance.cancelled': 'follow-cancel',
      'core.performance.rescheduled': 'follow-reschedule',
      'core.performance.moved': 'follow-move',
      'core.production.updated': 'follow-guidance',
    },
  },

  jobs: {
    // One booking of a decision to refund everyone, so a refund that fails is retried and listed without holding up the rest.
    'box-office.cancel-order': job({ payload: z.object({ orderId: z.string(), performanceId: z.string(), what: z.string() }), retries: 8 }),
  },

  tasks: {
    // Expires baskets whose hold has lapsed and that no purchase has cleaned up on its way past.
    'box-office.sweep-holds': task({ every: '5m' }),
    // Moves ticket money from deferred to income once its performance has taken place. The one trigger for it.
    'box-office.recognise-income': task({ dailyAt: '04:10' }),
    // Releases reservations nobody has paid for, at the time the theatre set before the start.
    'box-office.release-reservations': task({ every: '5m' }),
  },

  contributes: {
    // The ticket types whose rules Box office itself fixes. Companion tickets are for people on the
    // access scheme, up to the companions it allows them (core.access-scheme:companions); complimentary
    // tickets are issued only by approving a request, never sold.
    'box-office.ticket-type': [
      { id: 'companion', name: 'Companion', kind: 'companion', requirementRefs: ['core.access-scheme:companions'], needsPaidTicket: true, recheckAtEntry: false, sort: 90 },
      { id: 'complimentary', name: 'Complimentary', kind: 'complimentary', sort: 99 },
      // A wheelchair space for someone on the access scheme who stays in their wheelchair (Matt,
      // 2026-11-17). It has no price of its own: it costs the lowest price the buyer can have in its
      // band (prices.ts), and an application not yet decided is enough, with the booking flagged.
      { id: 'wheelchair', name: 'Wheelchair space', kind: 'standard', requirementRefs: ['core.access-scheme:wheelchair'], recheckAtEntry: false, sort: 80 },
    ],
    // Box office owns its part of a payment: it makes the sale real when the money arrives.
    'payments.settlement': [{ id: 'box-office' }],
    // Box office's part of the night report, when Front of house is on.
    'front-of-house.report-section': [{ id: 'box-office.attendance', file: 'attendance' }],
    // Its panel in the till: a reservation to take payment for, or tickets to sell at the desk.
    'payments.desk-basket': [{ id: 'box-office' }],
    // A performance with bookings is not cancelled, rescheduled or moved until someone decides what happens to them.
    'core.change-guard': [{ id: 'box-office' }],
    'core.change-impact': [{ id: 'box-office' }],
    // The booking button on the public pages: on sale, a few left, sold out, not yet, or closed.
    'core.booking-action': [{ id: 'box-office' }],
    'core.navigation': [
      { id: 'box-office.sell', menu: 'console', group: 'box-office', section: 'everyday', to: '/console/box-office/sell', icon: 'i-lucide-ticket', ability: 'box-office.order.view', order: 10 },
      { id: 'box-office.orders', menu: 'console', group: 'box-office', section: 'everyday', to: '/console/box-office/orders', icon: 'i-lucide-receipt', ability: 'box-office.order.view', order: 20 },
      { id: 'box-office.performances', menu: 'console', group: 'box-office', section: 'everyday', to: '/console/box-office/performances', icon: 'i-lucide-calendar', ability: 'box-office.performance.manage', order: 30 },
      { id: 'box-office.reports', menu: 'console', group: 'box-office', section: 'everyday', to: '/console/box-office/reports/sales', icon: 'i-lucide-chart-column', ability: 'box-office.report.view', order: 38 },
      { id: 'box-office.codes', menu: 'console', group: 'box-office', section: 'everyday', to: '/console/box-office/codes', icon: 'i-lucide-percent', ability: 'box-office.promo.manage', order: 36 },
      { id: 'box-office.comps', menu: 'console', group: 'box-office', section: 'everyday', to: '/console/box-office/comps', icon: 'i-lucide-gift', ability: 'box-office.comp.request', order: 35, count: 'box-office.comps-waiting' },
      // The door in live mode: the camera reads tickets one after another (Matt's option B, 2026-11-17).
      { id: 'box-office.door', menu: 'live', to: '/live/door', icon: 'i-lucide-scan-qr-code', ability: 'box-office.ticket.admit', order: 15 },
      { id: 'box-office.ticket-types', menu: 'admin', group: 'modules', to: '/admin/modules/box-office/ticket-types', icon: 'i-lucide-tags', ability: 'box-office.pricing.manage', order: 40, settingsIn: ['box-office.performances'] },
      { id: 'box-office.ticket-presets', menu: 'admin', group: 'modules', to: '/admin/modules/box-office/ticket-presets', icon: 'i-lucide-ticket', ability: 'box-office.pricing.manage', order: 41, settingsIn: ['box-office.performances'] },
    ],
    // Ticket money is owed to the audience until the performance has taken place.
    'finance.system-account': [
      { id: 'deferred-ticket-income', name: 'Deferred ticket income', kind: 'liability' },
      { id: 'ticket-income', name: 'Ticket income', kind: 'income' },
      // What is kept of a ticket's price when it is cancelled and refunded less the fee.
      { id: 'booking-fee-income', name: 'Booking fee income', kind: 'income' },
    ],
    'core.record-resolver': [{ id: 'box-office.comp-request', file: 'comp-request' }],
    // Comps requests waiting for a decision, on the console home of whoever may decide them.
    'core.count': [{ id: 'box-office.comps-waiting', file: 'comps-waiting' }],
    'core.upcoming': [{ id: 'box-office.tickets', file: 'tickets' }],
    'core.home-card': [{ id: 'box-office.comps', home: 'console', ability: 'box-office.comp.approve', component: 'BoxOfficeCompsCard', urgency: 'today', count: 'box-office.comps-waiting' }],
    'core.vocabulary': [{
      id: 'box-office.comp-reason',
      label: 'Reasons for complimentary tickets',
      terms: [
        { slug: 'cast', label: 'Cast' },
        { slug: 'crew', label: 'Crew' },
        { slug: 'press', label: 'Press' },
        { slug: 'reviewer', label: 'Reviewer' },
        { slug: 'sponsor', label: 'Sponsor' },
        { slug: 'other', label: 'Other' },
      ],
    }, {
      id: 'box-office.override-reason',
      label: 'Reasons for admitting anyway',
      terms: [
        { slug: 'membership-shown', label: 'Membership shown in person' },
        { slug: 'proof-shown', label: 'Proof shown in person' },
        { slug: 'manager-decision', label: 'Manager\'s decision' },
        { slug: 'other', label: 'Other' },
      ],
    }, {
      id: 'box-office.cancellation-reason',
      label: 'Reasons for cancelling tickets',
      terms: [
        { slug: 'illness', label: 'Illness' },
        { slug: 'cannot-attend', label: 'Cannot attend' },
        { slug: 'booked-in-error', label: 'Booked in error' },
        { slug: 'other', label: 'Other' },
      ],
    }],
    // Ticket money still deferred for a performance that has taken place holds up closing its period.
    'finance.period-close-check': [
      { id: 'box-office.unrecognised-income', file: 'unrecognised-income' },
    ],
    // Messages to buyers. Each is about a booking the person made, so none can be switched off.
    'core.notification-type': [{
      // Not in the specification's list: the step that proves the address before seats are kept.
      id: 'box-office.reservation-confirm',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const],
      lane: 'prompt' as const,
      variables: { link: 'sealed' as const, show: 'text' as const, when: 'text' as const, until: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Confirm your reservation at {{ theatre }}',
          body: 'You asked to reserve tickets for **{{ show }}**, {{ when }}.\n\n[Confirm my reservation]({{ link }})\n\nYour seats are held until {{ until }}. They are not reserved until you press the link. If you did not ask for this, you can ignore this email and the seats will go back on sale.',
        },
      },
    }, {
      id: 'box-office.order-reserved',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const],
      lane: 'prompt' as const,
      // The desk code finds the order and the link changes it, so both are sealed.
      variables: { reference: 'text' as const, show: 'text' as const, when: 'text' as const, tickets: 'text' as const, amountDue: 'text' as const, deskCode: 'sealed' as const, link: 'sealed' as const },
      wording: {
        'en-GB': {
          subject: 'Reserved: {{ show }}, {{ when }}',
          body: 'Your tickets are reserved. Nothing has been paid yet: you pay at the box office when you arrive.\n\n**{{ show }}**, {{ when }}\n\nTickets: {{ tickets }}\n\nTo pay on arrival: **{{ amountDue }}**\n\nBooking reference: **{{ reference }}**\n\nDesk code: **{{ deskCode }}**\n\nShow the reference or the desk code at the box office. They are not tickets and will not let you in at the door.\n\nIf you cannot come, or need fewer tickets, please let them go so somebody else can have them:\n\n[Change or cancel my reservation]({{ link }})\\n\\nThis link works until the reservation is paid for. Once you have paid, your tickets come with a new one.',
        },
      },
    }, {
      id: 'box-office.reservation-released',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      variables: { reference: 'text' as const, show: 'text' as const, when: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your reservation has been released: {{ show }}, {{ when }}',
          body: 'Your reservation **{{ reference }}** for **{{ show }}**, {{ when }}, was not paid for in time, so the seats have gone back on sale. Nothing was charged.\n\nIf you still want to come, ask the box office: there may be tickets left.',
        },
      },
    }, {
      id: 'box-office.order-confirmed',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const],
      lane: 'prompt' as const,
      // A door code lets its holder in and the link changes the booking, so both are sealed.
      variables: { reference: 'text' as const, show: 'text' as const, when: 'text' as const, tickets: 'text' as const, paid: 'text' as const, codes: 'sealed' as const, link: 'sealed' as const },
      wording: {
        'en-GB': {
          subject: 'Your tickets: {{ show }}, {{ when }}',
          body: 'You are booked.\n\n**{{ show }}**, {{ when }}\n\nTickets: {{ tickets }}\n\nPaid: **{{ paid }}**\n\nBooking reference: **{{ reference }}**\n\n[Show my tickets]({{ link }})\n\nEach ticket has its own code, which is scanned at the door:\n\n{{ codes }}\n\nAnyone with a code can use that ticket, so only pass this email on to the people you are bringing.',
        },
      },
    }, {
      id: 'box-office.order-confirmed-guest',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const],
      lane: 'prompt' as const,
      // The confirmation for a buyer who has never signed in: the same, with core's link that opens their account.
      variables: { reference: 'text' as const, show: 'text' as const, when: 'text' as const, tickets: 'text' as const, paid: 'text' as const, codes: 'sealed' as const, link: 'sealed' as const, account: 'sealed' as const },
      wording: {
        'en-GB': {
          subject: 'Your tickets: {{ show }}, {{ when }}',
          body: 'You are booked.\n\n**{{ show }}**, {{ when }}\n\nTickets: {{ tickets }}\n\nPaid: **{{ paid }}**\n\nBooking reference: **{{ reference }}**\n\n[Show my tickets]({{ link }})\n\nEach ticket has its own code, which is scanned at the door:\n\n{{ codes }}\n\nAnyone with a code can use that ticket, so only pass this email on to the people you are bringing.\n\nWant to see all your bookings in one place? [Open your account]({{ account }}). There is no password: the link signs you in, once, and works until you first sign in.',
        },
      },
    }, {
      id: 'box-office.order-exchanged',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const],
      lane: 'prompt' as const,
      // The new door codes let their holder in, so they are sealed.
      variables: { reference: 'text' as const, was: 'text' as const, now: 'text' as const, money: 'text' as const, codes: 'sealed' as const },
      wording: {
        'en-GB': {
          subject: 'Your tickets have been exchanged: {{ reference }}',
          body: 'We have exchanged tickets on booking **{{ reference }}**.\n\nWas: {{ was }}\n\nNow: **{{ now }}**\n\n{{ money }}\n\nThe old tickets no longer work. Your new tickets:\n\n{{ codes }}\n\nAnyone with a code can use that ticket, so only pass this email on to the people you are bringing.',
        },
      },
    }, {
      id: 'box-office.order-cancelled',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      variables: { reference: 'text' as const, show: 'text' as const, when: 'text' as const, cancelled: 'text' as const, remaining: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Cancelled: {{ show }}, {{ when }}',
          body: 'We have cancelled {{ cancelled }} on booking **{{ reference }}** for **{{ show }}**, {{ when }}.\n\n{{ remaining }}',
        },
      },
    }, {
      // A performance cancelled, rescheduled or moved, where the decision was to cancel the bookings.
      id: 'box-office.performance-cancelled',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      lane: 'prompt' as const,
      variables: { reference: 'text' as const, show: 'text' as const, when: 'text' as const, what: 'text' as const, money: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Cancelled: {{ show }}, {{ when }}',
          body: 'We are sorry: **{{ show }}**, {{ when }}, {{ what }}.\n\n{{ money }}\n\nBooking reference: **{{ reference }}**',
        },
      },
    }, {
      // A performance rescheduled or moved with the bookings kept, or cancelled with an exchange offered.
      id: 'box-office.performance-changed',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      lane: 'prompt' as const,
      variables: { reference: 'text' as const, show: 'text' as const, what: 'text' as const, now: 'text' as const, next: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'A change to {{ show }}',
          body: '**{{ show }}** {{ what }}.\n\n{{ now }}\n\n{{ next }}\n\nBooking reference: **{{ reference }}**',
        },
      },
    }, {
      // Staging effects, or a depicted content warning, added to a show someone has already booked (C-57).
      id: 'box-office.guidance-added',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      lane: 'prompt' as const,
      variables: { reference: 'text' as const, show: 'text' as const, what: 'text' as const, pageUrl: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Something to know before you see {{ show }}',
          body: 'We have added information about **{{ show }}** that you may want to read before you come.\n\n{{ what }}\n\nYou can read it all on the show\'s page: {{ pageUrl }}\n\nNothing is needed from you. If you cannot come now, contact the box office to exchange your tickets or to have them refunded.\n\nBooking reference: **{{ reference }}**',
        },
      },
    }],
  },

  presets: {
    'small-venue': { settings: { 'box-office.cancellations.by-buyer': true, 'box-office.orders.desk-seat-cap': 60 } },
    'student-society': { settings: { 'box-office.comps.per-performance': 10 } },
  },
})
