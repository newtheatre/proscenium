// Every role with its abilities, and the list of abilities a role can hold (ID-22).
import { z } from 'zod'
import { all, defineRoute, nowMs } from '#kit'
import { useRegistry } from '#kit/registry'
import { HOLDER, LIVE, OWNER_DOES_NOT_READ } from '../../identity/grants'
import { abilityCatalogue } from '../../identity/facts'

export default defineRoute({ ability: 'core.role.read', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  const roles = await all<{ id: string, key: string, name: string, description: string | null, fixed: number, opens_members_area: number, expiry_rule: string, expiry_days: number | null, archived_at: number | null }>('SELECT * FROM core_roles ORDER BY fixed DESC, name')
  const abilities = await all<{ role_id: string, ability: string }>('SELECT role_id, ability FROM core_role_abilities')
  const at = nowMs()
  const holders = await all<{ role_id: string, n: number }>(`SELECT g.role_id, count(DISTINCT ${HOLDER}) AS n FROM core_grants g WHERE ${LIVE} GROUP BY g.role_id`, at, at)
  const registry = useRegistry()
  return {
    roles: roles.map(r => ({
      id: r.id, key: r.key, name: r.name, description: r.description, fixed: !!r.fixed, opensMembersArea: !!r.opens_members_area,
      expiryRule: r.expiry_rule, expiryDays: r.expiry_days, archived: !!r.archived_at, holders: holders.find(h => h.role_id === r.id)?.n ?? 0,
      abilities: r.fixed ? [...registry.abilities.keys()].filter(a => !OWNER_DOES_NOT_READ.has(a)) : abilities.filter(a => a.role_id === r.id).map(a => a.ability),
    })),
    catalogue: await abilityCatalogue(actor),
  }
})
