// Change a role (ID-22). The Owner role cannot be changed.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateRole } from '../../../identity/roles'
import { roleInput } from '../../../identity/inputs'

export default defineRoute({ ability: 'core.role.manage', rateLimit: 'write', input: roleInput }, async (event, { input, unit, actor }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await updateRole(unit, actor, id, input)
  return { id }
})
