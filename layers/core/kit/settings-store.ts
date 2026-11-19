// Reading and changing settings. Overrides are read once per request (R3); only overrides are
// stored, so a better default upstream reaches every theatre that never changed it.
import { useContext } from './context'
import { useRegistry } from './registry'
import { defaultValue, validateSettingValue, type SettingEntry, type SettingRule } from './settings'
import { Refusal } from './refusal'
import { newId } from './ids'
import { nowMs } from './clock'
import type { UnitView } from './unit'
import type { SettingKey, SettingValue } from './registry-types'

async function overrides(): Promise<Map<string, unknown>> {
  const context = useContext()
  context.cache.settings ??= (async () => {
    const map = new Map<string, unknown>()
    try {
      const rows = await context.env.DB.prepare('SELECT key, value FROM core_settings').all<{ key: string, value: string }>()
      for (const row of rows.results) map.set(row.key, JSON.parse(row.value))
      // A renamed setting carries its old key's value until it is changed under the new one.
      for (const [old, key] of useRegistry().settingAliases) if (map.has(old) && !map.has(key)) map.set(key, map.get(old))
    }
    catch (error) {
      // Before the first migration there is no table: every setting has its default.
      if (!/no such table/i.test(String(error))) throw error
    }
    return map
  })()
  return context.cache.settings
}

/** The key a setting is declared under now: a renamed key's old name answers for one major version. */
export function currentKey(key: string): string {
  return useRegistry().settingAliases.get(key) ?? key
}

export function settingEntry(key: string): SettingEntry {
  const found = useRegistry().settings.get(currentKey(key))
  if (!found) throw new Error(`"${key}" is not a declared setting`)
  return found.entry
}

/** A setting's value, typed from the registry. Read once per request, so it never changes mid-request. */
export async function useSetting<K extends SettingKey>(asked: K): Promise<SettingValue<K>> {
  const key = currentKey(asked)
  const entry = settingEntry(key)
  const map = await overrides()
  return (map.has(key) ? map.get(key) : defaultValue(entry)) as SettingValue<K>
}

/** Whether a setting has been changed from its default. */
export async function isOverridden(key: string): Promise<boolean> {
  return (await overrides()).has(currentKey(key))
}

/** Every value of one module, by short key, with the proposed changes applied: what the rules see. */
async function moduleValues(module: string, changes: ReadonlyMap<string, unknown> = new Map()) {
  const registry = useRegistry()
  const map = await overrides()
  const values: Record<string, unknown> = {}
  for (const [key, { module: owner, entry }] of registry.settings) {
    if (owner !== module) continue
    const value = changes.has(key) ? changes.get(key) : map.has(key) ? map.get(key) : defaultValue(entry)
    values[key.slice(module.length + 1)] = value
  }
  return values
}

async function holds(rule: SettingRule, values: Record<string, unknown>): Promise<boolean> {
  try {
    return await rule.check(values)
  }
  catch {
    return false
  }
}

export interface SettingChange { key: string, value?: unknown, reset?: boolean }
type ChangeOptions = { reason?: string, confirm?: boolean }

/**
 * Changes several settings at once in the caller's unit of work. Every value is checked against its
 * entry first; then each module's rules see all the changes together, so settings that depend on each
 * other (Google on, and addresses that must use Google) are saved in one go, in any order. A rule
 * that already failed before is not this change's to fix, so it does not block it. A rule the changes
 * break names, in `fields`, the change it blames: the first one whose removal lets the rule hold.
 */
export async function changeSettings(unit: UnitView, asked: readonly SettingChange[], options: ChangeOptions = {}): Promise<Record<string, unknown>> {
  const registry = useRegistry()
  const prepared: { key: string, entry: SettingEntry, module: string, reset: boolean, after: unknown }[] = []
  for (const change of asked) {
    const key = currentKey(change.key)
    const found = registry.settings.get(key)
    if (!found) throw new Refusal('core.setting.unknown', `There is no setting called ${key}.`, { status: 404 })
    const { entry, module } = found
    if (entry.onChange === 'reason' && !options.reason?.trim()) throw new Refusal('core.setting.reason-needed', 'Say why you are changing this setting.', { status: 422, fields: { reason: 'required', [key]: 'required' } })
    if (entry.onChange === 'confirm' && options.confirm !== true) throw new Refusal('core.setting.confirm-needed', 'This setting asks for the change to be confirmed before it is saved.', { status: 422, fields: { confirm: 'required' } })
    const reset = change.reset === true
    let after: unknown = defaultValue(entry)
    if (!reset) {
      const result = validateSettingValue(entry, change.value ?? null)
      if (!result.ok) throw new Refusal('core.setting.invalid', `This value cannot be saved: it ${result.reason}.`, { status: 422, fields: { value: result.reason, [key]: result.reason } })
      after = result.value
    }
    prepared.push({ key, entry, module, reset, after })
  }

  const pending = new Map(prepared.map(c => [c.key, c.after]))
  for (const module of new Set(prepared.map(c => c.module))) {
    const mine = prepared.filter(c => c.module === module)
    const after = await moduleValues(module, pending)
    const before = await moduleValues(module)
    for (const rule of registry.settingRules.get(module) ?? []) {
      if (await holds(rule, after) || !(await holds(rule, before))) continue
      let blamed = mine[0]!.key
      for (const c of mine) {
        const without = new Map(pending)
        without.delete(c.key)
        if (await holds(rule, await moduleValues(module, without))) {
          blamed = c.key
          break
        }
      }
      const message = `${module}.settings.rules.${rule.id}`
      throw new Refusal('core.setting.rule-failed', message, { status: 422, fields: { value: message, [blamed]: message } })
    }
  }

  const saved: Record<string, unknown> = {}
  for (const c of prepared) saved[c.key] = await writeSetting(unit, c.key, c.entry, c.after, { reason: options.reason, reset: c.reset })
  return saved
}

/**
 * Changes a setting in the caller's unit of work: validates against the entry and the module's
 * rules, then writes the override, the history row, the audit row and core.setting.changed.
 * Passing `null` for a setting that has a default resets it (the override is deleted).
 */
export async function changeSetting(unit: UnitView, asked: string, raw: unknown, options: { reason?: string, reset?: boolean, confirm?: boolean } = {}): Promise<unknown> {
  const saved = await changeSettings(unit, [{ key: asked, value: raw, reset: options.reset }], options)
  return saved[currentKey(asked)]
}

async function writeSetting(unit: UnitView, key: string, entry: SettingEntry, after: unknown, options: { reason?: string, reset: boolean }): Promise<unknown> {
  const { reset } = options
  const value = after
  const map = await overrides()
  const before = map.has(key) ? map.get(key) : defaultValue(entry)
  const context = useContext()
  const at = nowMs()
  // A change under the new name settles a renamed setting: the old key's row goes.
  if (entry.replaces) unit.add({ sql: 'DELETE FROM core_settings WHERE key = ?', params: [entry.replaces] })
  if (reset) {
    unit.add({ sql: 'DELETE FROM core_settings WHERE key = ?', params: [key] })
  }
  else {
    unit.add({
      sql: 'INSERT INTO core_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by',
      params: [key, JSON.stringify(value), at, context.actor.accountId ?? null],
    })
  }
  const shown = (v: unknown) => entry.sensitive ? JSON.stringify('changed') : JSON.stringify(v ?? null)
  unit.add({
    sql: 'INSERT INTO core_setting_changes (id, key, old_value, new_value, reason, at, actor) VALUES (?, ?, ?, ?, ?, ?, ?)',
    params: [newId('sch'), key, shown(before), shown(after), options.reason ?? null, at, context.actor.accountId ?? null],
  })
  unit.audit({ action: 'update', ability: entry.change, record: ['core.setting', key], detail: { reset } })
  unit.announce('core.setting.changed', { key })
  unit.afterCommit(() => { delete context.cache.settings })
  return after
}
