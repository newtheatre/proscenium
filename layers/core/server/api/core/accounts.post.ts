// Add a person by name, and by address if there is one (ID-06). An address that already has an
// account answers with that account instead of making a second.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { accountLabel } from '../../identity/accounts'
import { findOrCreateAccount } from '../../identity/guests'

export default defineRoute({
  ability: 'core.account.create',
  rateLimit: 'write',
  input: z.object({
    name: z.string().trim().min(1).max(200), // not-policy: a person's name
    address: z.email().max(254).nullable().optional(), // not-policy: the longest address SMTP allows
  }).strict(),
}, async (_event, { input, unit }) => {
  const found = await findOrCreateAccount(unit, { address: input.address, name: input.name, origin: 'staff' })
  if (found.created) unit.audit({ action: 'create', record: ['core.account', found.accountId] })
  return { id: found.accountId, created: found.created, label: found.created ? input.name : await accountLabel(found.accountId) }
})
