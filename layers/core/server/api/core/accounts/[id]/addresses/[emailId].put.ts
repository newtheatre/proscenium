// Make one of a person's verified addresses the one a side writes to, for them (ID-46). The address
// it replaces is told.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { useAddressFor } from '../../../../../identity/my-addresses'
import { editableAccount } from '../../../../../identity/staff-edit'

export default defineRoute({
  ability: 'core.account.update',
  record: event => ['core.account', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ use: z.enum(['audience', 'members']) }).strict(),
}, async (event, { input, unit, record }) => {
  await useAddressFor(unit, await editableAccount(record!.id), getRouterParam(event, 'emailId', { decode: true })!, input.use)
  return { ok: true }
})
