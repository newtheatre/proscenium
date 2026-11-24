// S4: meetings the signed-in person is invited to that have not ended.
import { defineRoute } from '#kit'
import { myMeetings } from '../../../meetings'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({ meetings: await myMeetings(actor.accountId!) }))
