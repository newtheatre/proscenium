// A module was switched on: make the ledger accounts it declares, locked to it. When Finance itself
// is switched on, make every declared account of the modules already on.
import { defineListener } from '#kit'
import { enabledModules } from '#kit/modules-store'
import { ensureSystemAccounts } from '../ledger'

export default defineListener(async (event, unit) => {
  const moduleId = event.payload.moduleId as string
  const modules = moduleId === 'finance' ? [...await enabledModules()] : [moduleId]
  for (const id of modules) await ensureSystemAccounts(unit, id)
})
