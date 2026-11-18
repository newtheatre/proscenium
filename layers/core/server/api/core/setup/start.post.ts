// Setup, step 1: who the first Owner is, and the options for their passkey.
import { z } from 'zod'
import { defineRoute, newId, refuse } from '#kit'
import { catalogueValues } from '#kit/catalogues'
import { registrationOptions } from '../../../identity/passkeys'
import { requireSetupNeeded, writeTicket } from '../../../identity/setup'
import { normaliseAddress } from '../../../identity/accounts'

export default defineRoute({
  public: true,
  rateLimit: 'sign-in',
  input: z.object({
    name: z.string().trim().min(1).max(120), // not-policy: the column's own length
    address: z.email().max(254), // not-policy: the longest address
    // The theatre's name and time zone (AC-11): the core.site.name and core.locale.time-zone settings.
    theatre: z.string().trim().min(1).max(80).optional(), // not-policy: the setting's own length
    timeZone: z.string().max(64).optional(), // not-policy: the longest IANA zone name
  }),
}, async (event, { input, unit }) => {
  await requireSetupNeeded()
  if (input.timeZone && !catalogueValues('time-zone').includes(input.timeZone))
    refuse('core.input.invalid', 'Choose a time zone from the list.', { status: 422, fields: { timeZone: 'invalid' } })
  const address = normaliseAddress(input.address)
  const userId = newId('acc')
  const { challengeId, options } = await registrationOptions(unit, event, { purpose: 'setup', accountId: null, userId, userName: address, displayName: input.name })
  await writeTicket(event, { name: input.name, address, userId, challengeId, theatre: input.theatre, timeZone: input.timeZone })
  return { options }
})
