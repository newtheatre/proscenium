// S7: the polls the viewer has sent, open ones first.
import { defineRoute } from '#kit'
import { sentPolls } from '../../../polls'

export default defineRoute({ ability: 'availability.find.use', rateLimit: 'default' }, async (_event, { actor }) => ({ polls: await sentPolls(actor) }))
