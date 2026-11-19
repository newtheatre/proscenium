// Make one of a person's verified addresses the one a side writes to, for them (ID-46). The address
// it replaces is told.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { useAddressFor } from '../../../../../identity/my-addresses'
import { editableAccount } from '../../../../../identity/staff-edit'

export default defineRoute({
  ability: 'core.account.update',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ use: z.enum(['audience', 'members']) }).strict(),
}, async (event, { input, unit, record }) => {
  await useAddressFor(unit, await editableAccount(record!.id), getRouterParam(event, 'emailId')!, input.use)
  return { ok: true }
})
