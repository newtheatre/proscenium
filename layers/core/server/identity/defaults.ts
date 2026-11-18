// What a module brings with it the first time it is switched on (FH-4): the abilities its facts
// declare as defaults, and the roles it offers as presets, so a fresh install works before anyone
// edits roles or facts. A fact that has any ability mapped keeps the theatre's mapping, and a role
// whose key exists, archived or not, is left alone. Each default is offered once: core_module_defaults
// records it, so a role or mapping the theatre removes is not made again. The hourly task
// core.module-defaults offers what modules already on have not been offered, which is how a site
// that switched a module on before its defaults shipped gets them after a deploy.
import { all, createUnit, first, newId, nowMs, usePoint, useSetting } from '#kit'
import { enabledModules } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import { OWNER, withImplied } from './grants'
import { yearEndIsSet } from './year-end'

export interface RolePreset { id: string, key: string, name: string, description?: string, abilities: string[], opensMembersArea?: boolean }

/** The first Owner, or null before setup has written one. */
async function firstOwner(): Promise<string | null> {
  const owner = await first<{ account_id: string }>('SELECT g.account_id FROM core_grants g JOIN core_roles r ON r.id = g.role_id WHERE r.key = ? ORDER BY g.granted_at LIMIT 1', OWNER)
  return owner?.account_id ?? null
}

/** Who a mapping made by default is recorded against: whoever switched the module on, else an Owner. */
async function recordedBy(moduleId: string): Promise<string | null> {
  const switched = await first<{ changed_by: string | null }>('SELECT changed_by FROM core_modules WHERE module_id = ?', moduleId)
  return switched?.changed_by ?? await firstOwner()
}

const OFFER = 'INSERT INTO core_module_defaults (kind, key, module_id, offered_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING'

/**
 * The facts and role presets of `moduleId` that have not been offered yet, made in one unit. A default
 * the theatre already has (a fact it mapped, a role with the preset's key) is recorded as offered
 * and left alone. Safe to run twice.
 */
export async function ensureModuleDefaults(moduleId: string, by?: string): Promise<{ facts: number, roles: number }> {
  const registry = useRegistry()
  const unit = createUnit()
  const at = nowMs()
  let facts = 0
  let roles = 0
  const offered = new Set((await all<{ kind: string, key: string }>('SELECT kind, key FROM core_module_defaults WHERE module_id = ?', moduleId)).map(r => `${r.kind}:${r.key}`))
  const offer = (kind: 'fact' | 'role', key: string) => unit.add({ sql: OFFER, params: [kind, key, moduleId, at] })

  const declared = [...registry.facts].filter(([name, f]) => f.module === moduleId && f.decl.defaults?.length && !offered.has(`fact:${name}`))
  const actor = declared.length ? by ?? await recordedBy(moduleId) : null
  if (declared.length && actor) {
    const mapped = new Set((await all<{ fact: string }>('SELECT DISTINCT fact FROM core_fact_abilities WHERE pinned_record = \'\'')).map(r => r.fact))
    for (const [name, { decl }] of declared) {
      if (mapped.has(name)) {
        offer('fact', name)
        continue
      }
      const abilities = withImplied(decl.defaults ?? []).filter(a => registry.abilities.get(a)?.decl.risk === 'normal')
      if (!abilities.length) continue
      offer('fact', name)
      unit.add({
        sql: `INSERT INTO core_fact_abilities (fact, ability, pinned_record, confirmed_privileged_at, created_by, created_at) VALUES ${abilities.map(() => '(?, ?, \'\', NULL, ?, ?)').join(', ')} ON CONFLICT DO NOTHING`,
        params: abilities.flatMap(a => [name, a, actor, at]),
      })
      unit.audit({ action: 'update', detail: { fact: name, abilities: abilities.length, defaults: true } })
      facts++
    }
  }

  const presets = (await usePoint<RolePreset>('core.role-preset')).filter(p => p.module === moduleId && !offered.has(`role:${p.value.id}`))
  if (presets.length) {
    const taken = new Set((await all<{ key: string }>('SELECT key FROM core_roles WHERE key IN (SELECT value FROM json_each(?))', JSON.stringify(presets.map(p => p.value.key)))).map(r => r.key))
    const rule = (await yearEndIsSet()) ? 'year_end' : (await useSetting('core.grants.allow-no-expiry')) ? 'none' : 'days'
    for (const { value: preset } of presets) {
      if (taken.has(preset.key)) {
        offer('role', preset.id)
        continue
      }
      const abilities = withImplied(preset.abilities.filter(a => registry.abilities.has(a)))
      if (!abilities.length) continue
      offer('role', preset.id)
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

  if (unit.size) await unit.commit()
  return { facts, roles }
}

/**
 * Offers every module that is on the defaults it has not offered yet: the catch-up after a deploy
 * for modules switched on before their defaults shipped. Waits for setup, which makes core's.
 */
export async function ensureEnabledModuleDefaults(): Promise<{ facts: number, roles: number }> {
  const made = { facts: 0, roles: 0 }
  if (!(await firstOwner())) return made
  for (const moduleId of await enabledModules()) {
    const { facts, roles } = await ensureModuleDefaults(moduleId)
    made.facts += facts
    made.roles += roles
  }
  return made
}
