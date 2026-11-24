// S4: the polls asking the signed-in person.
import { defineRoute } from '#kit'
import { myPolls } from '../../../polls'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({ polls: await myPolls(actor.accountId!) }))
