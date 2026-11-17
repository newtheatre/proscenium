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

/** The `always` secrets a module declares that are not set: switching it on is blocked until they are (F-16). */
export function missingSecrets(id: string): string[] {
  const manifest = useRegistry().modules.get(id)?.manifest
  const env = useContext().env as Record<string, unknown>
  return Object.entries(manifest?.secrets ?? {})
    .filter(([name, decl]) => decl.needed === 'always' && !(typeof env[name] === 'string' && env[name]))
    .map(([name]) => name)
}

/**
 * The modules that switching `id` on would also switch on: every module it requires, directly or
 * through another, that is off now, those required first. `id` itself is not in the list.
 */
export async function requiredOff(id: string): Promise<string[]> {
  const registry = useRegistry()
  const enabled = await enabledModules()
  const out: string[] = []
  const visit = (other: string, path: string[]) => {
    if (path.includes(other)) return
    for (const needed of registry.modules.get(other)?.manifest.requires ?? []) visit(needed, [...path, other])
    if (other !== id && !enabled.has(other) && !out.includes(other)) out.push(other)
  }
  visit(id, [])
  return out
}

export interface SwitchOptions {
  /** Switching on: also switch on every module it requires that is off, after the person confirmed the list (F-16). */
  withRequired?: boolean
}

/**
 * Switches a module on or off in the caller's unit. Switching on is refused until every module it
 * requires is on, unless `withRequired` asks for those to be switched on with it; switching off is
 * refused while a module that requires it is on (F-18). Answers every module switched, in order.
 */
export async function setModuleEnabled(unit: UnitView, id: string, on: boolean, options: SwitchOptions = {}): Promise<string[]> {
  const registry = useRegistry()
  const entry = registry.modules.get(id)
  if (!entry) throw new Refusal('core.module.unknown', `There is no module called ${id}.`, { status: 404 })
  if (alwaysOn(id)) throw new Refusal('core.module.always-on', `${id} is always on.`, { status: 409 })
  const enabled = await enabledModules()
  let switching = [id]
  if (on) {
    const missing = (entry.manifest.requires ?? []).filter(other => !enabled.has(other))
    if (missing.length && !options.withRequired) throw new Refusal('core.module.requires', `${id} needs ${missing.join(', ')} switched on first.`, { status: 409, remedy: `Switch on ${missing.join(', ')}, then ${id}.`, fields: { requires: missing.join(',') } })
    if (missing.length) {
      const also = await requiredOff(id)
      const absent = also.filter(other => !registry.modules.has(other))
      if (absent.length) throw new Refusal('core.module.absent', `${id} needs ${absent.join(', ')}, which this installation does not have.`, { status: 409, fields: { requires: absent.join(',') } })
      switching = [...also, id]
    }
    for (const other of switching) {
      const secrets = missingSecrets(other)
      if (secrets.length) throw new Refusal('core.module.secrets', `${other} needs the secret ${secrets.join(', ')} set before it can be switched on.`, { status: 409, remedy: `Add ${secrets.join(', ')} as a Worker secret in the Cloudflare dashboard, then try again.`, fields: { module: other, secrets: secrets.join(',') } })
    }
  }
  else {
    const dependants = [...registry.modules.values()].filter(m => enabled.has(m.manifest.id) && m.manifest.requires?.includes(id)).map(m => m.manifest.id)
    if (dependants.length) throw new Refusal('core.module.required', `${id} cannot be switched off while ${dependants.join(', ')} ${dependants.length === 1 ? 'needs' : 'need'} it.`, { status: 409, remedy: `Switch off ${dependants.join(', ')} first.`, fields: { requiredBy: dependants.join(',') } })
  }
  const context = useContext()
  const at = nowMs()
  for (const moduleId of switching) {
    unit.add({
      sql: `INSERT INTO core_modules (module_id, enabled, enabled_at, disabled_at, changed_by, manifest_seen) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (module_id) DO UPDATE SET enabled = excluded.enabled, enabled_at = coalesce(excluded.enabled_at, core_modules.enabled_at), disabled_at = coalesce(excluded.disabled_at, core_modules.disabled_at), changed_by = excluded.changed_by, manifest_seen = excluded.manifest_seen`,
      params: [moduleId, on ? 1 : 0, on ? at : null, on ? null : at, context.actor.accountId ?? null, registry.modules.get(moduleId)!.manifest.since],
    })
    unit.audit({ action: 'state', ability: 'core.modules.manage', record: ['core.module', moduleId], detail: moduleId === id ? { on } : { on, with: id } })
    unit.announce(on ? 'core.module.enabled' : 'core.module.disabled', { moduleId })
  }
  unit.afterCommit(() => { delete context.cache.modules })
  return switching
}
