// The core: always on. Identity, the core domain and the interface are areas inside it, named by
// the second segment of their names. Foundations' part is written here; identity's is spread in from
// module/identity.ts and the core domain's from module/domain.ts and server/db/domain.ts.
import { z } from 'zod'
import { code, defineModule, defineSettingRules, event, secret, task } from '#kit'
import { settings, settingRules, settingGroups, settingPages } from './module/settings'
import { abilities, records } from './module/abilities'
import { points } from './module/points'
import * as identity from './module/identity'
import { tables } from './server/db/schema'
import * as domain from './module/domain'
import { tables as domainTables } from './server/db/domain'

export default defineModule({
  id: 'core',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  switchable: false,

  settings: { ...settings, ...identity.identitySettings, ...domain.settings },
  settingRules: defineSettingRules('core', [...settingRules.rules, ...identity.identitySettingRules, ...domain.settingRules]),
  settingGroups,
  settingPages,
  abilities: { ...abilities, ...identity.identityAbilities, ...domain.abilities },
  records: { ...records, ...identity.identityRecords, ...domain.records },
  facts: { ...identity.identityFacts, ...domain.facts },
  tables: { ...tables, ...domainTables },
  points: { ...points, ...identity.identityPoints, ...domain.points },
  contributes: {
    ...domain.contributes,
    ...identity.identityContributions,
    'core.health-check': [...identity.identityContributions['core.health-check'], ...domain.contributes['core.health-check'], { id: 'core.signing-keys', file: 'signing-keys' }, { id: 'core.site-origin', file: 'site-origin' }, { id: 'core.search-indexes', file: 'search-indexes' }],
    'core.vocabulary': [...domain.contributes['core.vocabulary'], ...identity.identityContributions['core.vocabulary']],
    'core.file-slot': [...domain.contributes['core.file-slot'], ...identity.identityContributions['core.file-slot']],
    'core.public-component': [...domain.contributes['core.public-component'], ...identity.identityContributions['core.public-component']],
    'core.notification-type': [...identity.identityContributions['core.notification-type'], ...domain.contributes['core.notification-type']],
    'core.count': [...identity.identityContributions['core.count'], ...domain.contributes['core.count']],
    'core.account-notice': [...identity.identityContributions['core.account-notice']],
    'core.account-section': [...identity.identityContributions['core.account-section'], ...domain.contributes['core.account-section']],
    // My account's entries (identity spec part 6). The passkey offer after signing in is a getting-in
    // screen, not an entry; "Signing in" is where passkeys are kept.
    'core.navigation': [
      { id: 'core.account-details', menu: 'account', group: 'account', to: '/account/details', icon: 'i-lucide-user-round', ability: 'signed-in', order: 10 },
      { id: 'core.account-email', menu: 'account', group: 'account', to: '/account/email', icon: 'i-lucide-mail', ability: 'signed-in', order: 20, attention: 'core.unconfirmed-addresses' },
      { id: 'core.account-sign-in', menu: 'account', group: 'account', to: '/account/sign-in', match: '/account/passkey', icon: 'i-lucide-key-round', ability: 'signed-in', order: 30 },
      { id: 'core.account-data', menu: 'account', group: 'account', to: '/account/data', icon: 'i-lucide-download', ability: 'signed-in', order: 50 },
      { id: 'core.venues', menu: 'console', group: 'venues', section: 'everyday', to: '/console/venues', icon: 'i-lucide-building', ability: 'core.venue.manage', order: 30 },
      { id: 'core.closures', menu: 'admin', group: 'modules', to: '/admin/modules/core/closures', icon: 'i-lucide-calendar-x', ability: 'core.closure.manage', order: 35 },
      { id: 'core.email', menu: 'admin', group: 'email', to: '/admin/email', icon: 'i-lucide-mail-check', ability: 'core.sender.manage', order: 30 },
      { id: 'core.credits', menu: 'account', group: 'theatre', to: '/account/credits', icon: 'i-lucide-scroll-text', ability: 'signed-in', order: 42, count: 'core.my-credits', hideEmpty: true },
      { id: 'core.access-scheme', menu: 'account', group: 'theatre', to: '/account/access', icon: 'i-lucide-accessibility', ability: 'signed-in', order: 40, count: 'core.access-scheme-offered', hideEmpty: true },
      { id: 'core.people', menu: 'console', group: 'people', section: 'everyday', to: '/console/people', icon: 'i-lucide-users', ability: 'core.account.read', order: 10 },
      { id: 'core.grants', menu: 'console', group: 'people', section: 'everyday', to: '/console/people/grants', icon: 'i-lucide-key-round', ability: 'core.grant.read', order: 20 },
      { id: 'core.data-requests', menu: 'console', group: 'people', section: 'everyday', to: '/console/people/data-requests', icon: 'i-lucide-file-lock', ability: 'core.data-request.manage', order: 40, count: 'core.data-requests-waiting' },
      { id: 'core.merges', menu: 'console', group: 'people', section: 'everyday', to: '/console/people/merges', match: '/console/people/merge', icon: 'i-lucide-merge', ability: 'core.account.merge', order: 50 },
      { id: 'core.access-scheme-queue', menu: 'console', group: 'people', section: 'everyday', to: '/console/people/access-scheme', icon: 'i-lucide-accessibility', ability: 'core.access-scheme.read', order: 60, count: 'core.access-scheme-waiting' },
      { id: 'core.productions', menu: 'console', group: 'programme', section: 'everyday', to: '/console/programme/productions', icon: 'i-lucide-drama', ability: 'core.production.view', order: 10 },
      { id: 'core.calendar', menu: 'console', group: 'programme', section: 'everyday', to: '/console/programme/calendar', icon: 'i-lucide-calendar-days', ability: 'core.production.view', order: 15 },
      { id: 'core.seasons', menu: 'admin', group: 'modules', to: '/admin/modules/core/seasons', icon: 'i-lucide-calendar-range', ability: 'core.season.manage', order: 20 },
      { id: 'core.modules', menu: 'admin', group: 'modules', to: '/admin/modules', icon: 'i-lucide-blocks', ability: ['core.modules.manage', 'core.health.view'], order: 10 },
      { id: 'core.vocabularies', menu: 'admin', group: 'theatre', to: '/admin/vocabularies', icon: 'i-lucide-list-tree', ability: 'core.vocabulary.manage', order: 40 },
      // Identity's site administration (identity spec part 6): defining roles and facts, and how people sign in.
      { id: 'core.roles', menu: 'admin', group: 'access', to: '/admin/roles', match: '/admin/roles', icon: 'i-lucide-shield-user', ability: 'core.role.read', order: 10 },
      { id: 'core.settings-history', menu: 'admin', group: 'upkeep', to: '/admin/settings-history', icon: 'i-lucide-history', ability: 'core.audit.view', order: 80 },
      { id: 'core.facts', menu: 'admin', group: 'access', to: '/admin/facts', icon: 'i-lucide-badge-check', ability: 'core.role.read', order: 20 },
    ],
    // The console's fixed groups, with their icons; their order is fixed in shared/navigation.ts.
    // System holds core's own screens; each module's settings page sits in the module's own group.
    'core.navigation-group': [
      { id: 'tonight', icon: 'i-lucide-moon-star' },
      { id: 'programme', icon: 'i-lucide-calendar-days' },
      { id: 'box-office', icon: 'i-lucide-ticket' },
      { id: 'front-of-house', icon: 'i-lucide-door-open' },
      { id: 'bar', icon: 'i-lucide-wine' },
      // Venues and spaces on their own for now, with room for the building's management to join them.
      { id: 'venues', icon: 'i-lucide-building' },
      { id: 'spaces', icon: 'i-lucide-building-2' },
      { id: 'training', icon: 'i-lucide-graduation-cap' },
      { id: 'membership', icon: 'i-lucide-id-card' },
      { id: 'people', icon: 'i-lucide-users' },
      { id: 'money', icon: 'i-lucide-pound-sterling' },
      { id: 'communications', icon: 'i-lucide-mail' },
      { id: 'forms', icon: 'i-lucide-file-text' },
      { id: 'reports', icon: 'i-lucide-chart-column' },
      { id: 'system', icon: 'i-lucide-settings' },
      // Admin's groups (R-33); their order is fixed in shared/navigation.ts.
      { id: 'theatre', menu: 'admin', icon: 'i-lucide-theater' },
      { id: 'modules', menu: 'admin', icon: 'i-lucide-blocks' },
      { id: 'access', menu: 'admin', icon: 'i-lucide-shield-check' },
      { id: 'email', menu: 'admin', icon: 'i-lucide-mail' },
      { id: 'connections', menu: 'admin', icon: 'i-lucide-plug' },
      { id: 'upkeep', menu: 'admin', icon: 'i-lucide-wrench' },
    ],
  },

  events: {
    announces: {
      'core.module.enabled': event({ version: 1, payload: z.object({ moduleId: z.string() }), internal: true }),
      'core.module.disabled': event({ version: 1, payload: z.object({ moduleId: z.string() }), internal: true }),
      'core.setting.changed': event({ version: 1, payload: z.object({ key: code() }), internal: true }),
      'core.release.applied': event({ version: 1, payload: z.object({ version: code() }), internal: true }),
      'core.job.died': event({ version: 1, payload: z.object({ jobId: z.string(), name: code() }), internal: true }),
      ...identity.identityEvents,
      ...domain.announces,
    },
    listens: { ...domain.listens },
  },

  jobs: { ...identity.identityJobs, ...domain.jobs },

  calls: { ...domain.calls },

  tasks: {
    'core.prune-history': task({ dailyAt: '04:00' }),
    'core.rotate-signing-keys': task({ dailyAt: '03:30' }),
    'core.search-rebuild': task({ dailyAt: '04:30' }),
    ...identity.identityTasks,
    ...domain.tasks,
  },

  // CORE_ENCRYPTION_KEY and CORE_SESSION_KEY protect everything else, so they stay Worker secrets.
  secrets: {
    CORE_ENCRYPTION_KEY: secret({ needed: 'when-used' }),
    ...identity.identitySecrets,
  },

  // Keys an administrator types into the app, on the page each belongs to (KeysCard).
  credentials: {
    ...identity.identityCredentials,
    ...domain.credentials,
  },
})
