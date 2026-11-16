// Disable an account (ID-31).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { disableAccount } from '../../../../identity/disable'

export default defineRoute({
  ability: 'core.account.disable',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ reason: z.enum(['security', 'conduct', 'requested', 'duplicate']) }),
}, async (_event, { input, unit, record }) => {
  await disableAccount(unit, record!.id, input.reason)
  return { id: record!.id, disabled: true }
})
