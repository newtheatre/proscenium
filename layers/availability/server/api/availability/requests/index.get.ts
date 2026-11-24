// Asked of me (S4): the requests asking the signed-in person, open ones first.
import { defineRoute } from '#kit'
import { entryDates } from '../../../entries'
import { myRequests } from '../../../requests'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({
  today: (await entryDates()).today,
  requests: await myRequests(actor.accountId!),
}))
