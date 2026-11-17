// Membership fees (Membership specification): prices for schemes, the charge each paid membership
// owes, and paying it through Payments, with the income posted to Finance. A separate module so that
// a free member list needs no Payments, and so that a theatre whose members pay somebody else (a
// students' union) leaves it off. Membership reaches it only through its point membership.charge.
// This file grows with the build; it declares only what the code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, event, setting, task } from '#kit'
import { tables } from './server/db/schema'

const change = 'membership-fees.settings.manage'
const charge = z.object({ chargeId: z.string(), membershipId: z.string() })

export default defineModule({
  id: 'membership-fees',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['membership', 'payments', 'finance'],

  settings: defineSettings('membership-fees', {
    // How long an online payment may take before its intent expires. The application itself stays open.
    'checkout.pay-within': setting.duration({ default: '30m', min: '10m', max: '2h', change, audience: 'public' }),
    // Whether a fee may be taken at the desk, in the till.
    'desk.enabled': setting.boolean({ default: true, change, audience: 'staff' }),
    'refunds.end-on-full-refund': setting.boolean({ default: true, change, audience: 'staff' }),
    'retention.charges': setting.duration({ default: '2555d', min: '2190d', max: '3650d', change, audience: 'public', quotable: true, onChange: 'confirm' }),
  }),
  settingGroups: {
    retention: { advanced: true },
  },

  records: defineRecords('membership-fees', {
    price: { table: 'membership_fees_prices' },
    charge: { table: 'membership_fees_charges' },
  }),
  abilities: defineAbilities('membership-fees', {
    // Privileged: a price is what members are asked to pay.
    'price.manage': ability({ on: 'membership.scheme', risk: 'privileged' }),
    // A membership's charge and payment, on its page.
    'charge.view': ability({ on: 'membership-fees.charge' }),
    // Marking a fee as waived, with a reason (P9). Privileged: it gives a membership away.
    'charge.waive': ability({ on: 'membership-fees.charge', risk: 'privileged', implies: ['charge.view'] }),
    // Taking a fee at the desk, through the till (P8). Nobody takes their own.
    'payment.take': ability({ on: 'membership-fees.charge', implies: ['charge.view', 'core.account.find'] }),
    // Asking for a refund of a fee. Approval follows Payments' own rule (P7).
    'refund.request': ability({ on: 'membership-fees.charge', implies: ['charge.view'] }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  events: {
    announces: {
      'membership-fees.charge.paid': event({ version: 1, payload: charge, internal: true }),
      'membership-fees.charge.refunded': event({ version: 1, payload: charge, internal: true }),
    },
  },

  tasks: {
    // Charges past membership-fees.retention.charges.
    'membership-fees.sweep-charges': task({ dailyAt: '04:00' }),
  },

  contributes: {
    // The fee collector Membership asks for (rules S5, P1).
    'membership.charge': [{ id: 'fees' }],
    // Its part of a payment: the charge paid and the membership activated in Payments' batch (P4).
    'payments.settlement': [{ id: 'membership-fees' }],
    // Its panel in the till: an application waiting for its fee, paid alone or with tickets (P8).
    'payments.desk-basket': [{ id: 'membership-fees' }],
    // Setting up fees (MEM-45): a price for each scheme that requires payment.
    'core.setup-step': [{ id: 'membership-fees.prices', required: false, to: '/console/membership-fees', order: 42 }],
    'core.record-resolver': [{ id: 'membership-fees.charge', file: 'charge' }, { id: 'membership-fees.price', file: 'price' }],
    // Expected to find none: a fee paid with no income in the ledger (tab 4).
    'core.health-check': [{ id: 'membership-fees.unposted-charges', file: 'unposted-charges' }],
    // Fees are income in full on the day they are paid (P6).
    'finance.system-account': [{ id: 'income', name: 'Membership fee income', kind: 'income' }],
    'core.navigation': [
      { id: 'membership-fees.prices', menu: 'console', group: 'membership', section: 'setup', to: '/console/membership-fees', match: '/console/membership-fees', icon: 'i-lucide-banknote', ability: 'membership-fees.price.manage', order: 15 },
    ],
  },
})
