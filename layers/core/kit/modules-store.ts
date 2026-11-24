// Which modules are switched on. The core and any module with switchable: false are always on; a
// support module (C-65) is on while a module that is on requires it. Switching on never runs a
// migration and switching off never deletes anything (M4).
import { useContext } from './context'
import { useRegistry } from './registry'
import { Refusal } from './refusal'
import { nowMs } from './clock'
import type { UnitView } from './unit'
import type { ModuleManifest } from './manifest'

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

function isSupport(id: string): boolean {
  return useRegistry().modules.get(id)?.manifest.support === true
}

/**
 * Which modules are on, given which are switched on: the core, those that cannot be switched, those
 * switched on, and every support module that one of those requires, directly or through another
 * support module. A support module's own stored row, if any, is ignored.
 */
export function resolveOn(manifests: Iterable<Pick<ModuleManifest, 'id' | 'switchable' | 'support' | 'requires'>>, switchedOn: (id: string) => boolean): Set<string> {
  const all = [...manifests]
  const on = new Set(all.filter(m => !m.support && (m.id === 'core' || m.switchable === false || switchedOn(m.id))).map(m => m.id))
  const support = new Map(all.filter(m => m.support).map(m => [m.id, m]))
  const queue = [...on]
  while (queue.length) {
    const id = queue.pop()!
    for (const needed of all.find(m => m.id === id)?.requires ?? []) {
      if (support.has(needed) && !on.has(needed)) {
        on.add(needed)
        queue.push(needed)
      }
    }
  }
  return on
}

/** The ids of every module that is on now. */
export async function enabledModules(): Promise<Set<string>> {
  const map = await states()
  return resolveOn([...useRegistry().modules.values()].map(e => e.manifest), id => map.get(id) === true)
}

export async function isEnabled(id: string): Promise<boolean> {
  if (!useRegistry().modules.has(id)) return false
  return (await enabledModules()).has(id)
}

/** Whether anybody has ever switched the module on or off (it has a row). A new site has none. */
export async function everSwitched(id: string): Promise<boolean> {
  return (await states()).has(id)
}

/**
 * First-run setup: switch on every module that asks to start on (onAtSetup) and that nobody has
 * switched either way yet, with what it requires. One whose secrets are not set yet is left off.
 */
export async function switchOnAtSetup(unit: UnitView): Promise<string[]> {
  const out: string[] = []
  for (const entry of useRegistry().modules.values()) {
    const id = entry.manifest.id
    if (!entry.manifest.onAtSetup || alwaysOn(id) || await everSwitched(id) || missingSecrets(id).length) continue
    out.push(...await setModuleEnabled(unit, id, true, { withRequired: true }))
  }
  return out
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
    if (other !== id && !enabled.has(other) && !isSupport(other) && !out.includes(other)) out.push(other)
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
  if (isSupport(id)) throw new Refusal('core.module.support', `${id} has no switch: it is on while a module that needs it is on.`, { status: 409 })
  const enabled = await enabledModules()
  let switching = [id]
  if (on) {
    const missing = await requiredOff(id)
    if (missing.length && !options.withRequired) throw new Refusal('core.module.requires', `${id} needs ${missing.join(', ')} switched on first.`, { status: 409, remedy: `Switch on ${missing.join(', ')}, then ${id}.`, fields: { requires: missing.join(',') } })
    if (missing.length) {
      const absent = missing.filter(other => !registry.modules.has(other))
      if (absent.length) throw new Refusal('core.module.absent', `${id} needs ${absent.join(', ')}, which this installation does not have.`, { status: 409, fields: { requires: absent.join(',') } })
      switching = [...missing, id]
    }
    for (const other of switching) {
      const secrets = missingSecrets(other)
      if (secrets.length) throw new Refusal('core.module.secrets', `${other} needs the secret ${secrets.join(', ')} set before it can be switched on.`, { status: 409, remedy: `Add ${secrets.join(', ')} as a Worker secret in the Cloudflare dashboard, then try again.`, fields: { module: other, secrets: secrets.join(',') } })
    }
  }
  else {
    const dependants = [...registry.modules.values()].filter(m => enabled.has(m.manifest.id) && !m.manifest.support && keptBy(m.manifest.id, id)).map(m => m.manifest.id)
    if (dependants.length) throw new Refusal('core.module.required', `${id} cannot be switched off while ${dependants.join(', ')} ${dependants.length === 1 ? 'needs' : 'need'} it.`, { status: 409, remedy: `Switch off ${dependants.join(', ')} first.`, fields: { requiredBy: dependants.join(',') } })
  }
  // Support modules that come on or go off with this switch are announced too, so their listeners
  // (a vocabulary made, a cache cleared) run as for any module.
  const map = await states()
  const after = resolveOn([...registry.modules.values()].map(e => e.manifest), other => switching.includes(other) ? on : map.get(other) === true)
  const carried = [...registry.modules.keys()].filter(other => isSupport(other) && enabled.has(other) !== after.has(other))
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
  for (const moduleId of carried) {
    const now = after.has(moduleId)
    unit.audit({ action: 'state', ability: 'core.modules.manage', record: ['core.module', moduleId], detail: { on: now, with: id } })
    unit.announce(now ? 'core.module.enabled' : 'core.module.disabled', { moduleId })
  }
  unit.afterCommit(() => { delete context.cache.modules })
  return [...switching, ...carried]
}

/** Whether `id` needs `needed`, directly or through support modules it requires. */
function keptBy(id: string, needed: string, seen = new Set<string>()): boolean {
  if (seen.has(id)) return false
  seen.add(id)
  return (useRegistry().modules.get(id)?.manifest.requires ?? []).some(other => other === needed || (isSupport(other) && keptBy(other, needed, seen)))
}
