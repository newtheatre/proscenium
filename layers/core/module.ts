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
