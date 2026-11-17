// The bar (Bar specification): products, prices and outlets, and selling them through Payments, so
// one card-reader payment can take tickets and drinks together. The bar takes no money itself: every
// sale is a part of a Payments intent, and its income is posted to Finance by Payments' one sealed
// posting. Bar and Box office never import each other; both plug into Payments' till.
// This file grows with the build; it declares only what the code so far uses.
import { ability, defineAbilities, defineModule, defineRecords } from '#kit'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'bar',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['payments', 'finance'],

  records: defineRecords('bar', {
    'outlet': { table: 'bar_outlets' },
    'product': { table: 'bar_products' },
    'price-list': { table: 'bar_price_lists' },
    'category': { table: 'bar_categories' },
  }),
  abilities: defineAbilities('bar', {
    // Categories, products and their variants.
    'product.manage': ability(),
    // Privileged: a price is what customers are asked to pay, and a list's percentage changes them all.
    'price.manage': ability({ risk: 'privileged' }),
    // Outlets: the places that sell, and the list each sells from.
    'outlet.manage': ability(),
  }),

  tables,

  events: {
    // Standard is made when the bar is switched on.
    listens: { 'core.module.enabled': 'standard-price-list' },
  },

  contributes: {
    // Bar income, in full on the day the money is taken (tab 3, "What is posted to the ledger").
    'finance.system-account': [{ id: 'income', name: 'Bar income', kind: 'income' }],
    'core.record-resolver': [
      { id: 'bar.outlet', file: 'outlet' },
      { id: 'bar.product', file: 'product' },
      { id: 'bar.price-list', file: 'price-list' },
    ],
    // The console's Bar group: set-up screens first; selling arrives with the till panel.
    'core.navigation': [
      { id: 'bar.products', menu: 'console', group: 'bar', section: 'setup', to: '/console/bar/products', match: '/console/bar/products', icon: 'i-lucide-beer', ability: 'bar.product.manage', order: 10 },
      { id: 'bar.price-lists', menu: 'console', group: 'bar', section: 'setup', to: '/console/bar/price-lists', match: '/console/bar/price-lists', icon: 'i-lucide-tags', ability: 'bar.price.manage', order: 20 },
      { id: 'bar.outlets', menu: 'console', group: 'bar', section: 'setup', to: '/console/bar/outlets', icon: 'i-lucide-store', ability: 'bar.outlet.manage', order: 30 },
    ],
  },
})
