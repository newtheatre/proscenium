// S7: the meetings the viewer has arranged that have not ended.
import { defineRoute } from '#kit'
import { arrangedMeetings } from '../../../meetings'

export default defineRoute({ ability: 'availability.find.use', rateLimit: 'default' }, async (_event, { actor }) => ({ meetings: await arrangedMeetings(actor) }))
