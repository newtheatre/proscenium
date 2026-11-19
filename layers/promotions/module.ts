// Promotions (the unified promotions design, approved by Matt on 18 November): one system for every
// reduction from a price, whatever is sold. Selling modules describe the kinds of item they sell
// through promotions.target and price each sale through Payments' payments.pricing, which this
// module answers; none of them imports it, and with it off everything sells at its list price.
// Prices stay with their modules (ticket types, bar price lists); a promotion is a conditional
// reduction from one. This file grows with the build; it declares only what the code so far uses.
import { ability, defineAbilities, defineModule, defineRecords, point } from '#kit'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'promotions',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['payments'],

  records: defineRecords('promotions', {
    promotion: { table: 'promotions_promotions' },
  }),
  abilities: defineAbilities('promotions', {
    // Making, limiting and retiring promotions and their codes. Privileged: it changes what customers pay.
    'promotion.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  points: {
    // A kind of item a selling module sells, which a promotion can apply to or require: its pickers,
    // how an item matches a narrowing, and whether a saving's line still stands.
    'promotions.target': point({ kind: 'code', contract: 'target' }),
  },

  contributes: {
    // Prices every sale: the selling modules write the savings it gives on their own lines.
    'payments.pricing': [{ id: 'promotions' }],
    'core.navigation': [
      { id: 'promotions.promotions', menu: 'console', group: 'money', section: 'everyday', to: '/console/promotions', match: '/console/promotions', icon: 'i-lucide-percent', ability: 'promotions.promotion.manage', order: 35 },
    ],
  },
})
