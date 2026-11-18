// The theatre's own choices for Who holds what's filters and for giving a role: its roles, with when
// a grant of each ends and the modules it can be given for, and the modules a grant can reach. Role
// names are not secret from someone who may read every grant.
import { asc, isNull } from 'drizzle-orm'
import { all, can, defineRoute, useDb, useSetting } from '#kit'
import { useRegistry } from '#kit/registry'
import { roles } from '../../../db/identity'
import { OWNER } from '../../../identity/grants'
import { nextYearEnd } from '../../../identity/year-end'

export default defineRoute({ ability: 'core.grant.read', rateLimit: 'default' }, async (_event, { actor }) => {
  const found = await useDb().select({ id: roles.id, key: roles.key, name: roles.name, expiryRule: roles.expiryRule, expiryDays: roles.expiryDays })
    .from(roles).where(isNull(roles.archivedAt)).orderBy(asc(roles.name))
  const registry = useRegistry()
  const held = await all<{ role_id: string, ability: string }>('SELECT role_id, ability FROM core_role_abilities')
  // The modules a role can be given for: those whose abilities it brings that may be given for one module.
  const reach = (roleId: string, key: string) => key === OWNER
    ? []
    : [...new Set(held.filter(h => h.role_id === roleId).flatMap((h) => {
        const declared = registry.abilities.get(h.ability)
        return declared && (declared.decl.grantAt ?? ['site', 'module', 'record']).includes('module') ? [declared.module] : []
      }))].sort()
  // Whether to offer giving, renewing and ending: the routes still check each grant.
  const manage = (await can(actor, 'core.grant.manage')).allowed
  return {
    roles: found.map(r => ({ id: r.id, name: r.name, owner: r.key === OWNER, expiryRule: r.expiryRule, expiryDays: r.expiryDays, modules: reach(r.id, r.key) })),
    modules: [...registry.modules.keys()],
    manage,
    yearEnd: await nextYearEnd(),
    allowNoExpiry: !!(await useSetting('core.grants.allow-no-expiry')),
  }
})
