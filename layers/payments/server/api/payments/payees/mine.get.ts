// The person's own bank details, masked: whether any are held, and the last two digits.
import { defineRoute } from '#kit'
import { payeeFor } from '../../../payees'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({
  payee: await payeeFor({ module: 'core', id: actor.accountId! }),
}))
