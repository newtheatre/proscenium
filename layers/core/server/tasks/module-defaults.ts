// Hourly (FH-4): every module that is on is offered the default roles and fact mappings it has not
// offered yet. Each is offered once (core_module_defaults), so this makes something only after a
// deploy that ships new defaults for a module already on; otherwise it reads one table and stops.
import { defineTask } from '#kit'
import { ensureEnabledModuleDefaults } from '../identity/defaults'

export default defineTask(async () => {
  await ensureEnabledModuleDefaults()
})
