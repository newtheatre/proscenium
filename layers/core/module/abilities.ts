// The core's record types and abilities.
import { ability, defineAbilities, defineRecords, record } from '#kit'

export const records = defineRecords('core', {
  'module': record({ table: 'core_modules' }),
  'setting': record({ table: 'core_settings' }),
  'job': record({ table: 'core_jobs' }),
  'credential': record({ table: 'core_credentials' }),
  'signing-key': record({ table: 'core_signing_keys' }),
})

export const abilities = defineAbilities('core', {
  'settings.manage': ability({ risk: 'privileged' }),
  'modules.manage': ability({ risk: 'privileged', grantAt: ['site'] }),
  'job.manage': ability({ on: 'core.job' }),
  // Reads the history panel of a record: who changed what and when, from the audit trail.
  'history.view': ability({ audit: false }),
  'health.view': ability({ grantAt: ['site'], audit: false }),
  // Searches the audit trail and every setting's history; each search is itself recorded.
  'audit.view': ability({ risk: 'privileged', fresh: false, audit: 'read', grantAt: ['site'] }),
  // Retiring a key at once invalidates every code it signed (F-37).
  'signing-key.retire': ability({ risk: 'privileged', grantAt: ['site'], implies: ['health.view'] }),
})
