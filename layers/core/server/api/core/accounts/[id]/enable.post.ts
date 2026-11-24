// Enable a disabled account again.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { enableAccount } from '../../../../identity/disable'

export default defineRoute({
  ability: 'core.account.disable',
  record: event => ['core.account', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => {
  await enableAccount(unit, record!.id)
  return { id: record!.id, disabled: false }
})
