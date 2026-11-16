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
  abilities: defineAbilities('gallery', {
    'sample.view': ability(),
    'sample.manage': ability(),
    'sample.admin': ability(),
  }),
  settings: defineSettings('gallery', {
    'demo.title': setting.text({ default: 'Hamlet', maxLength: 40, change: 'gallery.sample.manage', audience: 'public', quotable: true }),
    'demo.limit': setting.integer({ default: 6, min: 1, max: 10, change: 'gallery.sample.manage' }),
    'demo.open': setting.boolean({ default: true, change: 'gallery.sample.manage' }),
    'demo.hold': setting.duration({ default: '15m', min: '5m', max: '1h', change: 'gallery.sample.manage' }),
  }),
  contributes: {
    'core.count': [{ id: 'gallery.drafts', file: 'drafts' }],
    'core.account-section': [
      { id: 'gallery.tickets', target: 'account', side: 'audience', ability: 'signed-in', component: 'GalleryTickets', order: 10 },
      { id: 'gallery.drafts', target: 'account', side: 'audience', ability: 'signed-in', component: 'GalleryTickets', order: 20, count: 'gallery.drafts', hideEmpty: true },
    ],
    'core.navigation-group': [{ id: 'gallery', icon: 'i-lucide-layout-grid', after: 'box-office' }],
    'core.search-source': [{ id: 'gallery.production-search', record: 'gallery.production', ability: 'gallery.sample.view', route: '/api/gallery/search', shells: ['console'] }],
    'core.record-resolver': [{ id: 'gallery.production', file: 'gallery.production' }],
    'core.quick-action': [{ id: 'gallery.new-booking', to: '/console/gallery/form', icon: 'i-lucide-plus', ability: 'gallery.sample.view', keywords: 'gallery.quick-actions.new-booking.keywords' }],
    'core.navigation': [
      { id: 'gallery.list', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/list', icon: 'i-lucide-list', ability: 'gallery.sample.view', order: 10 },
      { id: 'gallery.form', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/form', icon: 'i-lucide-square-pen', ability: 'gallery.sample.view', order: 20 },
      { id: 'gallery.choices', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/choices', icon: 'i-lucide-list-checks', ability: 'gallery.sample.view', order: 25 },
      { id: 'gallery.steps', menu: 'console', group: 'gallery', section: 'setup', to: '/console/gallery/steps', icon: 'i-lucide-footprints', ability: 'gallery.sample.view', order: 30 },
      { id: 'gallery.feedback', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/feedback', icon: 'i-lucide-message-square', ability: 'gallery.sample.view', order: 40 },
      { id: 'gallery.denied', menu: 'console', group: 'gallery', section: 'setup', to: '/console/gallery/denied', icon: 'i-lucide-lock', ability: 'gallery.sample.admin', order: 50 },
      { id: 'gallery.drafts', menu: 'console', group: 'gallery', section: 'everyday', to: '/console/gallery/drafts', icon: 'i-lucide-file-pen', ability: 'gallery.sample.view', order: 60, count: 'gallery.drafts', hideEmpty: true },
      { id: 'gallery.account', menu: 'account', to: '/account/gallery', icon: 'i-lucide-ticket', order: 10 },
    ],
  },
})
