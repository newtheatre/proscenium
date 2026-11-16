// Change a grant's end date or scope: the grant ends and a new one is written (ID-23).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { changeGrant } from '../../../identity/roles'
import { scopeInput } from '../../../identity/inputs'

export default defineRoute({
  ability: 'core.grant.manage',
  record: event => ['core.grant', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ expiresAt: z.number().int().nullable().optional(), scope: scopeInput.optional() }).strict(),
}, async (_event, { input, unit, actor, record }) => {
  return { id: await changeGrant(unit, actor, record!.id, input) }
})
