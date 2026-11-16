// Start an erasure for somebody who asked by other means (ID-35), recording how staff checked who
// they were. The person still confirms it from the link sent to their address. Staff ask for their
// own erasure from their own account, like anybody else.
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { requestErasure } from '../../../identity/data-requests'
import { IDENTITY_CHECKS } from '../../../db/identity'

export default defineRoute({
  ability: 'core.data-request.manage',
  rateLimit: 'write',
  input: z.object({ accountId: z.string().max(40), kind: z.literal('erasure'), identityCheck: z.enum(IDENTITY_CHECKS) }).strict(), // not-policy: an id is 30 characters
}, async (event, { input, unit, actor }) => {
  if (input.accountId === actor.accountId) refuse('core.access.own-record', 'Ask for your own erasure from your account.', { status: 403 })
  return requestErasure(unit, event, actor, { accountId: input.accountId, identityCheck: input.identityCheck })
})
