// My passes: the signed-in person's own passes, with each one's code, what is owed for it, what is
// booked with it and the shows it could still book.
import { defineRoute } from '#kit'
import { myPasses } from '../../../pass-holding'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({ passes: await myPasses(actor.accountId!) }))
