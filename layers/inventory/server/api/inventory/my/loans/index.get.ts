// My loans (S14, INV-27): the signed-in person's own loans and requests.
import { defineRoute } from '#kit'
import { myLoans } from '../../../../borrowing'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({ loans: await myLoans(actor.accountId!) }))
