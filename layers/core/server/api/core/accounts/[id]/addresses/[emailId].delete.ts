// Remove one of a person's addresses, for them (ID-46): never the one the theatre writes to and never
// the last verified one. A verified address is told it was removed.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { removeAddress } from '../../../../../identity/my-addresses'
import { editableAccount } from '../../../../../identity/staff-edit'

export default defineRoute({
  ability: 'core.account.update',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  await removeAddress(unit, await editableAccount(record!.id), getRouterParam(event, 'emailId')!)
  return { ok: true }
})
