// What a module brings with it the first time it is switched on (FH-4): the abilities its facts
// declare as defaults, and the roles it offers as presets, so a fresh install works before anyone
// edits roles or facts. A fact that has any ability mapped keeps the theatre's mapping, and a role
// whose key exists, archived or not, is left alone.
import { all, createUnit, first, newId, nowMs, usePoint, useSetting } from '#kit'
import { useRegistry } from '#kit/registry'
import { OWNER, withImplied } from './grants'
import { yearEndIsSet } from './year-end'

export interface RolePreset { id: string, key: string, name: string, description?: string, abilities: string[], opensMembersArea?: boolean }

/** Who a mapping made by default is recorded against: whoever switched the module on, else an Owner. */
async function recordedBy(moduleId: string): Promise<string | null> {
  const switched = await first<{ changed_by: string | null }>('SELECT changed_by FROM core_modules WHERE module_id = ?', moduleId)
  if (switched?.changed_by) return switched.changed_by
  const owner = await first<{ account_id: string }>('SELECT g.account_id FROM core_grants g JOIN core_roles r ON r.id = g.role_id WHERE r.key = ? ORDER BY g.granted_at LIMIT 1', OWNER)
  return owner?.account_id ?? null
}

/** The facts and role presets of `moduleId` that have not been made yet, made in one unit. Safe to run twice. */
export async function ensureModuleDefaults(moduleId: string, by?: string): Promise<{ facts: number, roles: number }> {
  const registry = useRegistry()
  const unit = createUnit()
  const at = nowMs()
  let facts = 0
  let roles = 0

  const declared = [...registry.facts].filter(([, f]) => f.module === moduleId && f.decl.defaults?.length)
  const actor = declared.length ? by ?? await recordedBy(moduleId) : null
  if (declared.length && actor) {
    const mapped = new Set((await all<{ fact: string }>('SELECT DISTINCT fact FROM core_fact_abilities WHERE pinned_record = \'\'')).map(r => r.fact))
    for (const [name, { decl }] of declared) {
      if (mapped.has(name)) continue
      const abilities = withImplied(decl.defaults ?? []).filter(a => registry.abilities.get(a)?.decl.risk === 'normal')
      if (!abilities.length) continue
      unit.add({
        sql: `INSERT INTO core_fact_abilities (fact, ability, pinned_record, confirmed_privileged_at, created_by, created_at) VALUES ${abilities.map(() => '(?, ?, \'\', NULL, ?, ?)').join(', ')} ON CONFLICT DO NOTHING`,
        params: abilities.flatMap(a => [name, a, actor, at]),
      })
      unit.audit({ action: 'update', detail: { fact: name, abilities: abilities.length, defaults: true } })
      facts++
    }
  }

  const presets = (await usePoint<RolePreset>('core.role-preset')).filter(p => p.module === moduleId)
  if (presets.length) {
    const taken = new Set((await all<{ key: string }>('SELECT key FROM core_roles WHERE key IN (SELECT value FROM json_each(?))', JSON.stringify(presets.map(p => p.value.key)))).map(r => r.key))
    const rule = (await yearEndIsSet()) ? 'year_end' : (await useSetting('core.grants.allow-no-expiry')) ? 'none' : 'days'
    for (const { value: preset } of presets) {
      if (taken.has(preset.key)) continue
      const abilities = withImplied(preset.abilities.filter(a => registry.abilities.has(a)))
      if (!abilities.length) continue
      const id = newId('rol')
      unit.add({
        sql: 'INSERT INTO core_roles (id, key, name, description, fixed, opens_members_area, needs_managed_identity, expiry_rule, expiry_days, preset, created_at) VALUES (?, ?, ?, ?, 0, ?, 0, ?, ?, ?, ?) ON CONFLICT (key) DO NOTHING',
        params: [id, preset.key, preset.name, preset.description ?? null, preset.opensMembersArea ? 1 : 0, rule, rule === 'days' ? 365 : null, preset.id, at], // not-policy: a year, when the theatre allows neither a year end nor no end
      })
      unit.add({
        sql: 'INSERT INTO core_role_abilities (role_id, ability) SELECT ?, value FROM json_each(?) WHERE EXISTS (SELECT 1 FROM core_roles WHERE id = ?)',
        params: [id, JSON.stringify(abilities), id],
      })
      unit.announce('core.role.changed', { roleId: id }, { record: ['core.role', id] })
      unit.audit({ action: 'create', record: ['core.role', id], detail: { abilities: abilities.length, preset: preset.id } })
      roles++
    }
  }

  if (facts || roles) await unit.commit()
  return { facts, roles }
}
