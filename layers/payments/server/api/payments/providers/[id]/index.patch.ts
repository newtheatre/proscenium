// Takes a provider account out of use, or puts it back (Matt, 19 November). One out of use is not
// offered for payment; its payments, keys, readers and clearing account stay as they are.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, nowMs, refuse } from '#kit'
import { providerAccount } from '../../../../providers'

export default defineRoute({
  ability: 'payments.provider.manage',
  record: event => ['payments.provider-account', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ active: z.boolean() }).strict(),
}, async (_event, { input, record, unit }) => {
  const account = await providerAccount(record!.id!)
  if (!account) refuse('core.not-found', 'There is no such provider account.', { status: 404 })
  if (!!account!.active !== input.active) {
    unit.add({ sql: 'UPDATE payments_provider_accounts SET active = ?, updated_at = ? WHERE id = ?', params: [input.active ? 1 : 0, nowMs(), account!.id] })
    unit.audit({ action: 'update', record: ['payments.provider-account', account!.id] })
  }
  await unit.commit()
  return { active: input.active }
})
