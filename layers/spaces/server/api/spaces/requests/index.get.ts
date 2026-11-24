// The requests this person may decide, and their own greyed (SP-25, rules A2 and A3).
import { defineRoute } from '#kit'
import { decisionQueue } from '../../../decisions'

export default defineRoute({ ability: 'spaces.booking.decide', rateLimit: 'default' }, async (_event, { actor }) => ({ requests: await decisionQueue(actor) }))
