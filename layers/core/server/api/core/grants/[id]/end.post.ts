// End a grant (ID-23, ID-29). Refused if it would leave no Owner who can sign in.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { endGrant } from '../../../../identity/roles'
import { roleNotice } from '../../../../identity/notices'

export default defineRoute({
  ability: 'core.grant.manage',
  record: event => ['core.grant', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, actor, record }) => {
  const grant = await endGrant(unit, actor, record!.id)
  await roleNotice(unit, grant.account_id, grant.role_id, { given: false })
  return { id: record!.id, ended: true }
})
