// Which modules are switched on. The core and any module with switchable: false are always on.
// Switching on never runs a migration and switching off never deletes anything (M4).
import { useContext } from './context'
import { useRegistry } from './registry'
import { Refusal } from './refusal'
import { nowMs } from './clock'
import type { UnitView } from './unit'

async function states(): Promise<Map<string, boolean>> {
  const context = useContext()
  context.cache.modules ??= (async () => {
    const map = new Map<string, boolean>()
    try {
      const rows = await context.env.DB.prepare('SELECT module_id, enabled FROM core_modules').all<{ module_id: string, enabled: number }>()
      for (const row of rows.results) map.set(row.module_id, row.enabled === 1)
    }
    catch (error) {
      if (!/no such table/i.test(String(error))) throw error
    }
    return map
  })()
  return context.cache.modules
}

function alwaysOn(id: string): boolean {
  const entry = useRegistry().modules.get(id)
  return id === 'core' || entry?.manifest.switchable === false
}

/** The ids of every module that is on now. */
export async function enabledModules(): Promise<Set<string>> {
  const map = await states()
  const on = new Set<string>()
  for (const id of useRegistry().modules.keys()) if (alwaysOn(id) || map.get(id)) on.add(id)
  return on
}

export async function isEnabled(id: string): Promise<boolean> {
  if (!useRegistry().modules.has(id)) return false
  return alwaysOn(id) || (await states()).get(id) === true
}

/**
 * Switches a module on or off in the caller's unit. Switching on is refused until every module it
 * requires is on; switching off is refused while a module that requires it is on (F-18).
 */
export async function setModuleEnabled(unit: UnitView, id: string, on: boolean): Promise<void> {
  const registry = useRegistry()
  const entry = registry.modules.get(id)
  if (!entry) throw new Refusal('core.module.unknown', `There is no module called ${id}.`, { status: 404 })
  if (alwaysOn(id)) throw new Refusal('core.module.always-on', `${id} is always on.`, { status: 409 })
  const enabled = await enabledModules()
  if (on) {
    const missing = (entry.manifest.requires ?? []).filter(other => !enabled.has(other))
    if (missing.length) throw new Refusal('core.module.requires', `${id} needs ${missing.join(', ')} switched on first.`, { status: 409, remedy: `Switch on ${missing.join(', ')}, then ${id}.`, fields: { requires: missing.join(',') } })
  }
  else {
    const dependants = [...registry.modules.values()].filter(m => enabled.has(m.manifest.id) && m.manifest.requires?.includes(id)).map(m => m.manifest.id)
    if (dependants.length) throw new Refusal('core.module.required', `${id} cannot be switched off while ${dependants.join(', ')} ${dependants.length === 1 ? 'needs' : 'need'} it.`, { status: 409, remedy: `Switch off ${dependants.join(', ')} first.`, fields: { requiredBy: dependants.join(',') } })
  }
  const context = useContext()
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO core_modules (module_id, enabled, enabled_at, disabled_at, changed_by, manifest_seen) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (module_id) DO UPDATE SET enabled = excluded.enabled, enabled_at = coalesce(excluded.enabled_at, core_modules.enabled_at), disabled_at = coalesce(excluded.disabled_at, core_modules.disabled_at), changed_by = excluded.changed_by, manifest_seen = excluded.manifest_seen`,
    params: [id, on ? 1 : 0, on ? at : null, on ? null : at, context.actor.accountId ?? null, entry.manifest.since],
  })
  unit.audit({ action: 'state', ability: 'core.modules.manage', record: ['core.module', id], detail: { on } })
  unit.announce(on ? 'core.module.enabled' : 'core.module.disabled', { moduleId: id })
  unit.afterCommit(() => { delete context.cache.modules })
}
