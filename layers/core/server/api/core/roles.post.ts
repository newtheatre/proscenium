// Make a role (ID-22).
import { defineRoute } from '#kit'
import { createRole } from '../../identity/roles'
import { roleInput } from '../../identity/inputs'

export default defineRoute({ ability: 'core.role.manage', rateLimit: 'write', input: roleInput }, async (_event, { input, unit, actor }) => {
  return { id: await createRole(unit, actor, input) }
})
