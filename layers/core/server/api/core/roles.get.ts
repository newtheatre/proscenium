// Every role with its abilities, and the list of abilities a role can hold (ID-22).
import { z } from 'zod'
import { all, defineRoute } from '#kit'
import { useRegistry } from '#kit/registry'

export default defineRoute({ ability: 'core.role.read', rateLimit: 'default', input: z.object({}) }, async () => {
  const roles = await all<{ id: string, key: string, name: string, description: string | null, fixed: number, opens_members_area: number, expiry_rule: string, expiry_days: number | null, archived_at: number | null }>('SELECT * FROM core_roles ORDER BY fixed DESC, name')
  const abilities = await all<{ role_id: string, ability: string }>('SELECT role_id, ability FROM core_role_abilities')
  const registry = useRegistry()
  return {
    roles: roles.map(r => ({
      id: r.id, key: r.key, name: r.name, description: r.description, fixed: !!r.fixed, opensMembersArea: !!r.opens_members_area,
      expiryRule: r.expiry_rule, expiryDays: r.expiry_days, archived: !!r.archived_at,
      abilities: r.fixed ? [...registry.abilities.keys()] : abilities.filter(a => a.role_id === r.id).map(a => a.ability),
    })),
    catalogue: [...registry.abilities].map(([name, { module, decl }]) => ({ name, module, risk: decl.risk, implies: (decl.implies ?? []).map(s => `${module}.${s}`), label: `${module}.abilities.${name.slice(module.length + 1)}.label` })),
  }
})
