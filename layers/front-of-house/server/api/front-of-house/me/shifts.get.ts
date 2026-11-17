// "My shifts": coming and past, with hours this year (FH-17). Open to anyone with a place, so it
// asks only that they are signed in and reads their own rows.
import { defineRoute } from '#kit'
import { myShifts } from '../../../lists'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => myShifts(actor.accountId!))
