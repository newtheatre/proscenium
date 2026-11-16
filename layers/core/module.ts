// The core: always on. Identity, the core domain and the interface are areas inside it, named by
// the second segment of their names. Foundations' part is written here; identity's is spread in from
// module/identity.ts and the core domain's from module/domain.ts and server/db/domain.ts.
import { z } from 'zod'
import { code, defineModule, defineSettingRules, event, secret, task } from '#kit'
import { settings, settingRules } from './module/settings'
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
  abilities: { ...abilities, ...identity.identityAbilities, ...domain.abilities },
  records: { ...records, ...identity.identityRecords, ...domain.records },
  facts: { ...identity.identityFacts },
  tables: { ...tables, ...domainTables },
  points: { ...points, ...identity.identityPoints, ...domain.points },
  contributes: {
    ...domain.contributes,
    ...identity.identityContributions,
    'core.health-check': [...identity.identityContributions['core.health-check'], ...domain.contributes['core.health-check'], { id: 'core.signing-keys', file: 'signing-keys' }],
    'core.vocabulary': [...domain.contributes['core.vocabulary'], ...identity.identityContributions['core.vocabulary']],
    'core.public-component': [...domain.contributes['core.public-component'], ...identity.identityContributions['core.public-component']],
    // The account menu's entries. Identity's passkey page is the first; the rest arrive with their screens.
    'core.navigation': [
      { id: 'core.passkey', menu: 'account', to: '/account/passkey', icon: 'i-lucide-key-round', ability: 'signed-in', order: 10 },
      { id: 'core.venues', menu: 'console', group: 'programme', section: 'setup', to: '/console/programme/venues', icon: 'i-lucide-building', ability: 'core.venue.manage', order: 30 },
      { id: 'core.closures', menu: 'console', group: 'programme', section: 'setup', to: '/console/programme/closures', icon: 'i-lucide-calendar-x', ability: 'core.closure.manage', order: 35 },
      { id: 'core.email', menu: 'console', group: 'system', section: 'setup', to: '/console/system/email', icon: 'i-lucide-mail-check', ability: 'core.sender.manage', order: 30 },
      { id: 'core.access-scheme', menu: 'account', to: '/account/access', icon: 'i-lucide-accessibility', ability: 'signed-in', order: 40, count: 'core.access-scheme-offered', hideEmpty: true },
      { id: 'core.access-scheme-queue', menu: 'console', group: 'people', section: 'everyday', to: '/console/people/access-scheme', icon: 'i-lucide-accessibility', ability: 'core.access-scheme.read', order: 60, count: 'core.access-scheme-waiting' },
      { id: 'core.productions', menu: 'console', group: 'programme', section: 'everyday', to: '/console/programme/productions', icon: 'i-lucide-drama', ability: 'core.production.view', order: 10 },
      { id: 'core.seasons', menu: 'console', group: 'programme', section: 'setup', to: '/console/programme/seasons', icon: 'i-lucide-calendar-range', ability: 'core.season.manage', order: 20 },
      { id: 'core.vocabularies', menu: 'console', group: 'system', section: 'setup', to: '/console/system/vocabularies', icon: 'i-lucide-list-tree', ability: 'core.vocabulary.manage', order: 40 },
    ],
    // The console's fixed groups, with their icons; their order is fixed in shared/navigation.ts.
    // System holds core's own screens; each module's settings page sits in the module's own group.
    'core.navigation-group': [
      { id: 'tonight', icon: 'i-lucide-moon-star' },
      { id: 'programme', icon: 'i-lucide-calendar-days' },
      { id: 'box-office', icon: 'i-lucide-ticket' },
      { id: 'front-of-house', icon: 'i-lucide-door-open' },
      { id: 'bar', icon: 'i-lucide-wine' },
      { id: 'spaces', icon: 'i-lucide-building-2' },
      { id: 'training', icon: 'i-lucide-graduation-cap' },
      { id: 'membership', icon: 'i-lucide-id-card' },
      { id: 'people', icon: 'i-lucide-users' },
      { id: 'money', icon: 'i-lucide-pound-sterling' },
      { id: 'communications', icon: 'i-lucide-mail' },
      { id: 'forms', icon: 'i-lucide-file-text' },
      { id: 'reports', icon: 'i-lucide-chart-column' },
      { id: 'system', icon: 'i-lucide-settings' },
      // Site administration's groups (R-33); their order is fixed in shared/navigation.ts.
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
    ...identity.identityTasks,
    ...domain.tasks,
  },

  secrets: {
    CORE_ENCRYPTION_KEY: secret({ needed: 'when-used' }),
    CORE_TURNSTILE_SECRET_KEY: secret({ needed: 'optional' }),
    ...identity.identitySecrets,
    ...domain.secrets,
  },
})
