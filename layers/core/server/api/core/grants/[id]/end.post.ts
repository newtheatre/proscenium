// End a grant (ID-23, ID-29). Refused if it would leave no Owner who can sign in.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { endGrant } from '../../../../identity/roles'

export default defineRoute({
  ability: 'core.grant.manage',
  record: event => ['core.grant', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, actor, record }) => {
  await endGrant(unit, actor, record!.id)
  return { id: record!.id, ended: true }
})
