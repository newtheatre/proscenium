// The core's record types and abilities.
import { ability, defineAbilities, defineRecords, record } from '#kit'

export const records = defineRecords('core', {
  module: record({ table: 'core_modules' }),
  setting: record({ table: 'core_settings' }),
  job: record({ table: 'core_jobs' }),
  credential: record({ table: 'core_credentials' }),
})

export const abilities = defineAbilities('core', {
  'settings.manage': ability({ risk: 'privileged' }),
  'modules.manage': ability({ risk: 'privileged', grantAt: ['site'] }),
})
