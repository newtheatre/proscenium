// Fundraising (third round, spec 10): gifts of money and the records a charity needs to claim tax
// back on them. So far funds, giving online, campaigns and the donations list (FR-01, FR-02, FR-05
// to FR-12, FR-17). Checkout and till gifts, Gift Aid, sponsorships, collections and grants follow.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettingRules, defineSettings, event, setting, task } from '#kit'
import { CHANNELS, tables } from './server/db/schema'

const change = 'fundraising.settings.manage'

export default defineModule({
  id: 'fundraising',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  switchable: true,
  requires: ['payments', 'finance'],

  settings: defineSettings('fundraising', {
    // The amount buttons on the Give page, in minor units.
    'giving.presets': setting.custom({ schema: z.array(z.number().int().min(1)).min(1).max(6), default: [500, 1000, 2500, 5000], change, audience: 'public' }),
    // D1: the smallest and largest gift taken online; above it, the donor is asked to contact the theatre.
    'giving.min': setting.money({ default: 100, min: 100, max: 10000, change, audience: 'public', quotable: true }),
    'giving.max': setting.money({ default: 500000, min: 1000, max: 10000000, change, audience: 'public', quotable: true }),
    // How long a gift's payment stays open.
    'giving.pay-within': setting.duration({ default: '30m', min: '10m', max: '2h', change, audience: 'staff' }),
    // A donor's details on gifts with no Gift Aid hold.
    // Defaults for a new campaign: whether its page shows raised and target, and whether Gift Aid counts (K1).
    'campaigns.show-total': setting.boolean({ default: true, change, audience: 'staff' }),
    'campaigns.count-gift-aid': setting.boolean({ default: false, change, audience: 'staff' }),
    // K3: band edges for campaigns that show bands beside names, in minor units.
    'acknowledgement.bands': setting.custom({ schema: z.array(z.number().int().min(1)).min(2).max(8), default: [1000, 5000, 10000, 50000], change, audience: 'public' }),
    'retention.donations': setting.duration({ default: '2555d', min: '2190d', max: '3650d', change, audience: 'public', quotable: true, onChange: 'confirm' }),
  }),
  settingGroups: {
    retention: { advanced: true },
  },
  settingRules: defineSettingRules('fundraising', [
    { id: 'min-below-max', check: s => (s['giving.min'] as number) < (s['giving.max'] as number) },
    { id: 'bands-rising', check: s => (s['acknowledgement.bands'] as number[]).every((edge, i, all) => i === 0 || edge > all[i - 1]!) },
    { id: 'presets-within', check: s => (s['giving.presets'] as number[]).every(p => p >= (s['giving.min'] as number) && p <= (s['giving.max'] as number)) },
  ]),

  records: defineRecords('fundraising', {
    fund: { table: 'fundraising_funds' },
    campaign: { table: 'fundraising_campaigns' },
    donation: { table: 'fundraising_donations' },
  }),
  abilities: defineAbilities('fundraising', {
    // Gifts and their donors' names; every read is audited.
    'donation.view': ability({ on: 'fundraising.donation', fresh: false, audit: 'read', implies: ['core.account.find'] }),
    'fund.manage': ability({ risk: 'privileged' }),
    'campaign.manage': ability({ on: 'fundraising.campaign' }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  events: {
    announces: {
      'fundraising.donation.received': event({
        version: 1,
        payload: z.object({ donationId: z.string(), fundId: z.string(), campaignId: z.string().nullable(), productionId: z.string().nullable(), amountMinor: z.number().int(), channel: z.enum(CHANNELS) }),
        internal: false,
      }),
      'fundraising.donation.refunded': event({ version: 1, payload: z.object({ donationId: z.string(), refundedMinor: z.number().int() }), internal: false }),
      'fundraising.campaign.opened': event({ version: 1, payload: z.object({ campaignId: z.string() }), internal: false }),
      'fundraising.campaign.closed': event({ version: 1, payload: z.object({ campaignId: z.string() }), internal: false }),
      'fundraising.campaign.target-reached': event({ version: 1, payload: z.object({ campaignId: z.string() }), internal: false }),
    },
    listens: { 'core.module.enabled': 'default-fund', 'fundraising.donation.received': 'campaign-target' },
  },

  tasks: {
    // Opens published campaigns and closes open ones at their times.
    'fundraising.open-close-campaigns': task({ every: '15m' }),
  },

  contributes: {
    // M1: each fund's gifts are income in an account of its own, made with the fund.
    'finance.system-account': [{ id: 'donations', name: 'Donations', kind: 'income', scoped: true }],
    // FR-02: a gift is its own part of a payment.
    'payments.settlement': [{ id: 'fundraising' }],
    'core.record-resolver': [{ id: 'fundraising.fund', file: 'fund' }, { id: 'fundraising.campaign', file: 'campaign' }, { id: 'fundraising.donation', file: 'donation' }],
    'core.notification-type': [{
      // D8: once, on receipt. Never names the donor's card or anything they did not give us.
      id: 'fundraising.donation-thanks',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const],
      variables: { amount: 'text' as const, fund: 'text' as const, date: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Thank you for your gift to {{ theatre }}',
          body: 'Thank you for giving **{{ amount }}** to {{ theatre }} on {{ date }}. It goes to our **{{ fund }}**.\n\nYour support makes our work possible.',
        },
      },
    }, {
      // K2: once, when a campaign first reaches its target.
      id: 'fundraising.campaign-target-reached',
      category: 'transactional' as const,
      side: 'members' as const,
      channels: ['email' as const, 'inbox' as const],
      variables: { campaign: 'text' as const, target: 'text' as const },
      wording: {
        'en-GB': {
          subject: '{{ campaign }} has reached its target',
          body: 'The campaign **{{ campaign }}** has reached its target of {{ target }}.',
        },
      },
    }],
    'core.navigation': [
      { id: 'fundraising.donations', menu: 'console', group: 'money', section: 'everyday', to: '/console/fundraising/donations', icon: 'i-lucide-hand-heart', ability: 'fundraising.donation.view', order: 92 },
      { id: 'fundraising.campaigns', menu: 'console', group: 'money', section: 'everyday', to: '/console/fundraising/campaigns', icon: 'i-lucide-megaphone', ability: 'fundraising.campaign.manage', order: 93 },
      { id: 'fundraising.funds', menu: 'admin', group: 'modules', to: '/admin/modules/fundraising/funds', icon: 'i-lucide-piggy-bank', ability: 'fundraising.fund.manage', order: 33 },
    ],
  },
})
