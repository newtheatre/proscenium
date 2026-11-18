// Setup, step 1: who the first Owner is and what the theatre is, and the options for their passkey.
// The theatre's details are checked now, so nobody makes a passkey only to be refused at the end.
import { z } from 'zod'
import { defineRoute, newId } from '#kit'
import { catalogueValues } from '#kit/catalogues'
import { registrationOptions } from '../../../identity/passkeys'
import { requireSetupNeeded, writeTicket } from '../../../identity/setup'
import { normaliseAddress } from '../../../identity/accounts'

const theatre = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: core.site.name's own length
  timeZone: z.string().refine(v => catalogueValues('time-zone').includes(v), 'Choose a time zone from the list.'),
  country: z.string().refine(v => catalogueValues('country').includes(v), 'Choose a country from the list.'),
  contactEmail: z.union([z.literal(''), z.email().max(254)]).optional(), // not-policy: the setting's own length
})

export default defineRoute({
  public: true,
  rateLimit: 'sign-in',
  input: z.object({ name: z.string().trim().min(1).max(120), address: z.email().max(254), theatre }), // not-policy: the column's own lengths
}, async (event, { input, unit }) => {
  await requireSetupNeeded()
  const address = normaliseAddress(input.address)
  const userId = newId('acc')
  const { challengeId, options } = await registrationOptions(unit, event, { purpose: 'setup', accountId: null, userId, userName: address, displayName: input.name })
  const contactEmail = input.theatre.contactEmail ? normaliseAddress(input.theatre.contactEmail) : undefined
  await writeTicket(event, { name: input.name, address, userId, challengeId, theatre: { ...input.theatre, contactEmail } })
  return { options }
})
