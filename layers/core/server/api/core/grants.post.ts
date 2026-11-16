// Give somebody a role (ID-23, ID-29).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { createGrant } from '../../identity/roles'
import { scopeInput } from '../../identity/inputs'

export default defineRoute({
  ability: 'core.grant.manage',
  rateLimit: 'write',
  input: z.object({ accountId: z.string().max(40), roleId: z.string().max(40), scope: scopeInput.default({ kind: 'site' }), expiresAt: z.number().int().nullable().optional() }).strict(), // not-policy: ids are short
}, async (_event, { input, unit, actor }) => {
  return { id: await createGrant(unit, actor, input) }
})
