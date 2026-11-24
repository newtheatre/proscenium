// A fixture, not a product module: one screen of each page type in each shell, so the browser
// tests can open them signed in as different people and check them with axe. Only a build made
// with PROSCENIUM_GALLERY=1 includes it, and with it a test sign-in that reads who is asking from a
// header. Nothing here ships.
import { ability, defineAbilities, defineModule, defineSettings, setting } from '#kit'

export default defineModule({
  id: 'gallery',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  switchable: false,
  // The till's browser test sells through a gallery panel when Payments and Finance are on.
  // Find a time's browser test plans for a gallery company when Availability is on.
  uses: ['finance', 'payments', 'forms', 'availability'],
  abilities: defineAbilities('gallery', {
    'sample.view': ability(),
    'sample.manage': ability(),
    'sample.admin': ability(),
    // Held only by the browser test whose Admin overview has a count that never answers.
    'sample.slow': ability(),
  }),
  settings: defineSettings('gallery', {
    'demo.title': setting.text({ default: 'Hamlet', maxLength: 40, change: 'gallery.sample.manage', audience: 'public', quotable: true }),
    'demo.limit': setting.integer({ default: 6, min: 1, max: 10, change: 'gallery.sample.manage' }),
    'demo.open': setting.boolean({ default: true, change: 'gallery.sample.manage' }),
    'demo.hold': setting.duration({ default: '15m', min: '5m', max: '1h', change: 'gallery.sample.manage' }),
  }),
  contributes: {
    // Slots and an outcome action for the forms browser tests.
    'forms.slot': [
      { id: 'gallery.show-feedback', subject: 'gallery.production', attach: 'gallery.sample.manage', label: 'gallery.forms.feedback.label' },
      // Custom fields on every sample production, filled in on each one's page.
      { id: 'gallery.show-fields', subject: 'gallery.production', attach: 'gallery.sample.manage', edit: 'gallery.sample.view', mode: 'record' as const, label: 'gallery.forms.fields.label', limit: 3 },
    ],
    'forms.outcome-action': [{ id: 'gallery.note', file: 'note' }],
    'forms.template': [{ id: 'gallery.show-feedback', file: 'show-feedback' }, { id: 'gallery.show-fields', file: 'show-fields' }],
    'payments.desk-basket': [{ id: 'gallery' }],
    'availability.group': [{ id: 'gallery' }],
    'payments.settlement': [{ id: 'gallery' }],
    'finance.system-account': [{ id: 'income', name: 'Gallery income', kind: 'income' }],
    'core.count': [{ id: 'gallery.drafts', file: 'drafts' }, { id: 'gallery.none', file: 'none' }, { id: 'gallery.stalled', file: 'stalled' }],
    'core.record-fact': [{ id: 'gallery.seats-held', record: 'gallery.production', ability: 'gallery.sample.view', component: 'GalleryFactSeats', order: 10 }],
    'core.record-check': [{ id: 'gallery.poster', file: 'has-poster' }],
    'core.list-column': [{ id: 'gallery.sales', list: 'gallery.shows', ability: 'gallery.sample.view', component: 'GalleryShowSales', order: 10 }],
    'core.record-tab': [{ id: 'gallery.tickets', record: 'gallery.production', ability: 'gallery.sample.view', component: 'GalleryTicketsTab', order: 10, count: 'gallery.drafts' }],
    'core.home-card': [
      { id: 'gallery.drafts-waiting', home: 'console', ability: 'gallery.sample.view', component: 'GalleryDraftsCard', urgency: 'overdue', count: 'gallery.drafts' },
      { id: 'gallery.nothing', home: 'console', ability: 'gallery.sample.view', component: 'GalleryNothingCard', urgency: 'today', count: 'gallery.none' },
      { id: 'gallery.tip', home: 'console', ability: 'gallery.sample.view', component: 'GalleryTipCard', urgency: 'info' },
      { id: 'gallery.stalled', home: 'admin', ability: 'gallery.sample.slow', component: 'GalleryNothingCard', urgency: 'info', count: 'gallery.stalled' },
    ],
    'core.account-section': [
      { id: 'gallery.tickets', target: 'account', side: 'audience', ability: 'signed-in', component: 'GalleryTickets', order: 10 },
      { id: 'gallery.drafts', target: 'account', side: 'audience', ability: 'signed-in', component: 'GalleryTickets', order: 20, count: 'gallery.drafts', hideEmpty: true },
    ],
    // Practice mode's browser test practises the sample door.
    'core.practice-scenario': [{ id: 'gallery.door', version: 1, label: 'gallery.practice.door', summary: 'gallery.practice.door-summary', minutes: 5, needs: ['gallery'], samples: [], start: '/live/gallery', routes: ['/live/gallery'], abilities: ['gallery.sample.manage'], tasks: [{ id: 'admit', label: 'gallery.practice.admit' }] }],
    'core.navigation-group': [{ id: 'gallery', icon: 'i-lucide-layout-grid', after: 'box-office' }],
    'core.search-source': [{ id: 'gallery.production-search', record: 'gallery.production', ability: 'gallery.sample.view', route: '/api/gallery/search', shells: ['console'] }],
    'core.record-resolver': [{ id: 'gallery.production', file: 'gallery.production' }],
    'core.home-figure': [{ id: 'gallery.drafts', file: 'drafts' }, { id: 'gallery.broken', file: 'broken' }],
    'core.quick-action': [{ id: 'gallery.new-booking', to: '/console/gallery/form', icon: 'i-lucide-plus', ability: 'gallery.sample.view', keywords: 'gallery.quick-actions.new-booking.keywords' }],
    'core.navigation': [
      { id: 'gallery.list', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/list', icon: 'i-lucide-list', ability: 'gallery.sample.view', order: 10 },
      { id: 'gallery.form', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/form', icon: 'i-lucide-square-pen', ability: 'gallery.sample.view', order: 20 },
      { id: 'gallery.record', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/productions/prod-1', match: '/console/gallery/productions', icon: 'i-lucide-theater', ability: 'gallery.sample.view', order: 27 },
      { id: 'gallery.choices', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/choices', icon: 'i-lucide-list-checks', ability: 'gallery.sample.view', order: 25 },
      { id: 'gallery.shows', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/shows', icon: 'i-lucide-drama', ability: 'gallery.sample.view', order: 12 },
      { id: 'gallery.steps', menu: 'console', group: 'gallery', section: 'setup', to: '/console/gallery/steps', icon: 'i-lucide-footprints', ability: 'gallery.sample.view', order: 30 },
      { id: 'gallery.feedback', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/feedback', icon: 'i-lucide-message-square', ability: 'gallery.sample.view', order: 40 },
      { id: 'gallery.denied', menu: 'console', group: 'gallery', section: 'setup', to: '/console/gallery/denied', icon: 'i-lucide-lock', ability: 'gallery.sample.admin', order: 50 },
      { id: 'gallery.drafts', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/drafts', icon: 'i-lucide-file-pen', ability: 'gallery.sample.view', order: 60, count: 'gallery.drafts', hideEmpty: true },
      { id: 'gallery.forms-cases', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/forms-cases', icon: 'i-lucide-flask-conical', ability: 'gallery.sample.view', order: 70 },
      { id: 'gallery.live', menu: 'live', to: '/live/gallery', icon: 'i-lucide-scan-line', ability: 'gallery.sample.manage', order: 10 },
      { id: 'gallery.account', menu: 'account', to: '/account/gallery', icon: 'i-lucide-ticket', order: 10 },
    ],
  },
})
