// Add an email address for a person (ID-46). It is sent its link and does nothing until that is
// used; every verified address is told a way in was added by staff.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { addAddress } from '../../../../identity/my-addresses'
import { BY_STAFF, credentialNotice } from '../../../../identity/notices'
import { editableAccount } from '../../../../identity/staff-edit'

export default defineRoute({
  ability: 'core.account.update',
  record: event => ['core.account', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: z.object({ address: z.email().max(254) }).strict(), // not-policy: the longest address SMTP allows
}, async (event, { input, unit, record }) => {
  const account = await editableAccount(record!.id)
  const { id, created } = await addAddress(unit, event, account.id, input.address, 'staff')
  if (created) {
    await credentialNotice(unit, account.id, 'address', BY_STAFF)
    unit.audit({ action: 'create', record: ['core.account', account.id], detail: { emailId: id! } })
  }
  return { id }
})
