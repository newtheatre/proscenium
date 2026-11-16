// The core: always on. Identity, the core domain and the interface are areas inside it, named by
// the second segment of their names. This manifest holds foundations' part.
import { z } from 'zod'
import { code, defineModule, event, secret, task } from '#kit'
import { settings, settingRules } from './module/settings'
import { abilities, records } from './module/abilities'
import { points } from './module/points'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'core',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  switchable: false,

  settings,
  settingRules,
  abilities,
  records,
  tables,
  points,
  contributes: {
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
    ],
  },

  events: {
    announces: {
      'core.module.enabled': event({ version: 1, payload: z.object({ moduleId: z.string() }), internal: true }),
      'core.module.disabled': event({ version: 1, payload: z.object({ moduleId: z.string() }), internal: true }),
      'core.setting.changed': event({ version: 1, payload: z.object({ key: code() }), internal: true }),
      'core.release.applied': event({ version: 1, payload: z.object({ version: code() }), internal: true }),
      'core.job.died': event({ version: 1, payload: z.object({ jobId: z.string(), name: code() }), internal: true }),
    },
  },

  tasks: {
    'core.prune-history': task({ dailyAt: '04:00' }),
  },

  secrets: {
    CORE_ENCRYPTION_KEY: secret({ needed: 'when-used' }),
    CORE_TURNSTILE_SECRET_KEY: secret({ needed: 'optional' }),
  },
})
