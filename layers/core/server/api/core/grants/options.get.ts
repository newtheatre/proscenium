// The theatre's own choices for Who holds what's filters: its roles, and the modules a grant can
// reach. Role names are not secret from someone who may read every grant.
import { asc, isNull } from 'drizzle-orm'
import { can, defineRoute, useDb } from '#kit'
import { useRegistry } from '#kit/registry'
import { roles } from '../../../db/identity'

export default defineRoute({ ability: 'core.grant.read', rateLimit: 'default' }, async (_event, { actor }) => {
  const found = await useDb().select({ id: roles.id, name: roles.name }).from(roles).where(isNull(roles.archivedAt)).orderBy(asc(roles.name))
  // Whether to offer renewing and ending: the routes still check each grant.
  const manage = (await can(actor, 'core.grant.manage')).allowed
  return { roles: found, modules: [...useRegistry().modules.keys()], manage }
})
