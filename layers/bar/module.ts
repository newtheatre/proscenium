// The bar (Bar specification): products, prices and outlets, and selling them through Payments, so
// one card-reader payment can take tickets and drinks together. The bar takes no money itself: every
// sale is a part of a Payments intent, and its income is posted to Finance by Payments' one sealed
// posting. Bar and Box office never import each other; both plug into Payments' till.
// This file grows with the build; it declares only what the code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, event, setting, task } from '#kit'
import { tables } from './server/db/schema'

const change = 'bar.settings.manage'

export default defineModule({
  id: 'bar',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['payments', 'finance'],

  settings: defineSettings('bar', {
    // Starts a bar sale's reference, so it is not mistaken for a booking reference.
    'sales.reference-prefix': setting.text({ default: 'B', minLength: 1, maxLength: 3, change, audience: 'staff' }),
    // The age check and the refusals register (tab 4, "The age check and refusals").
    'age-check.enabled': setting.boolean({ default: true, change, audience: 'staff', onChange: 'confirm' }),
    'age-check.minimum-age': setting.integer({ default: 18, min: 16, max: 25, change, audience: 'public', quotable: true, onChange: 'confirm' }),
    'age-check.challenge-age': setting.integer({ default: 25, min: 18, max: 30, change, audience: 'public', quotable: true }),
    'age-check.description': setting.boolean({ default: false, change, audience: 'staff', onChange: 'confirm' }),
    'age-check.review-every': setting.duration({ default: '7d', min: '1d', max: '90d', change, audience: 'staff' }),
    'retention.age-checks': setting.duration({ default: '730d', min: '180d', max: '3650d', change, audience: 'staff', onChange: 'confirm' }),
  }),

  records: defineRecords('bar', {
    'outlet': { table: 'bar_outlets' },
    'product': { table: 'bar_products' },
    'price-list': { table: 'bar_price_lists' },
    'category': { table: 'bar_categories' },
    'opening': { table: 'bar_openings', owner: 'opened_by' },
    'sale': { table: 'bar_sales', owner: 'sold_by' },
    'age-check': { table: 'bar_age_checks', owner: 'by' },
    'register-review': { table: 'bar_register_reviews', owner: 'reviewed_by' },
  }),
  abilities: defineAbilities('bar', {
    // Categories, products and their variants.
    'product.manage': ability(),
    // Privileged: a price is what customers are asked to pay, and a list's percentage changes them all.
    'price.manage': ability({ risk: 'privileged' }),
    // Outlets: the places that sell, and the list each sells from.
    'outlet.manage': ability(),
    // Use the bar's panel in the till, at an outlet.
    'sale.sell': ability({ on: 'bar.outlet' }),
    // Close an outlet's opening; the person who opened it may close it.
    'opening.manage': ability({ on: 'bar.outlet' }),
    'settings.manage': ability({ risk: 'privileged' }),
    // The refusals register: reading it, and signing it as checked (which may erase a description).
    'age-check.view': ability(),
    'age-check.review': ability({ implies: ['age-check.view'] }),
  }),

  tables,

  events: {
    announces: {
      // A sales feed for an outside accounts system: a sale and its opening, no person.
      'bar.sale.paid': event({ version: 1, payload: z.object({ saleId: z.string(), openingId: z.string() }), internal: false }),
      'bar.opening.closed': event({ version: 1, payload: z.object({ openingId: z.string(), outletId: z.string() }), internal: false }),
      // For the duty manager's night report. Never carries the description.
      'bar.age-check.refused': event({ version: 1, payload: z.object({ ageCheckId: z.string(), openingId: z.string() }), internal: true }),
    },
    // Standard is made when the bar is switched on.
    listens: { 'core.module.enabled': 'standard-price-list' },
  },

  tasks: {
    // Erases descriptions of people refused once their rows pass the register's retention.
    'bar.sweep-retention': task({ dailyAt: '04:40' }),
  },

  contributes: {
    'core.vocabulary': [{
      id: 'bar.refusal-reason',
      label: 'Reasons for refusing a sale',
      terms: [
        { slug: 'no-id', label: 'No ID' },
        { slug: 'id-not-accepted', label: 'ID not accepted' },
        { slug: 'under-age', label: 'Under age' },
        { slug: 'proxy', label: 'Buying for someone under age' },
        { slug: 'drunk', label: 'Already drunk' },
        { slug: 'other', label: 'Other' },
      ],
    }],
    // Drinks paid for at the till, alone or on the same payment as tickets (tab 4).
    'payments.settlement': [{ id: 'bar' }],
    'payments.desk-basket': [{ id: 'bar' }],
    // Bar income, in full on the day the money is taken (tab 3, "What is posted to the ledger").
    'finance.system-account': [{ id: 'income', name: 'Bar income', kind: 'income' }],
    'core.record-resolver': [
      { id: 'bar.outlet', file: 'outlet' },
      { id: 'bar.product', file: 'product' },
      { id: 'bar.price-list', file: 'price-list' },
    ],
    // The console's Bar group for everyday work; set-up screens are tabs of the bar's page in Admin.
    'core.navigation': [
      // Bar > Sell: Payments' till narrowed to the bar's panel. The combined till is /live/till.
      { id: 'bar.sell', menu: 'console', group: 'bar', section: 'everyday', to: '/console/bar/sell', icon: 'i-lucide-shopping-basket', ability: 'bar.sale.sell', order: 10 },
      { id: 'bar.openings', menu: 'console', group: 'bar', section: 'everyday', to: '/console/bar/openings', icon: 'i-lucide-clock', ability: 'bar.opening.manage', order: 20 },
      { id: 'bar.products', menu: 'admin', group: 'modules', to: '/admin/modules/bar/products', match: '/admin/modules/bar/products', icon: 'i-lucide-beer', ability: 'bar.product.manage', order: 10 },
      { id: 'bar.price-lists', menu: 'admin', group: 'modules', to: '/admin/modules/bar/price-lists', match: '/admin/modules/bar/price-lists', icon: 'i-lucide-tags', ability: 'bar.price.manage', order: 20 },
      { id: 'bar.age-checks', menu: 'console', group: 'bar', section: 'setup', to: '/console/bar/age-checks', icon: 'i-lucide-id-card', ability: 'bar.age-check.view', order: 40 },
      { id: 'bar.outlets', menu: 'admin', group: 'modules', to: '/admin/modules/bar/outlets', icon: 'i-lucide-store', ability: 'bar.outlet.manage', order: 30 },
    ],
  },
})
