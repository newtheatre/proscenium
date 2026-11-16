// My email addresses, which are confirmed, and which each side writes to (ID-12).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { accountById } from '../../../identity/accounts'
import { addressesOf } from '../../../identity/my-addresses'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  return { addresses: await addressesOf((await accountById(actor.accountId!))!) }
})
