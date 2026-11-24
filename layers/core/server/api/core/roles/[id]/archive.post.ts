// Archive a role. Every live grant of it ends. The Owner role cannot be archived.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { archiveRole } from '../../../../identity/roles'

export default defineRoute({ ability: 'core.role.manage', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  await archiveRole(unit, actor, id)
  return { id, archived: true }
})
