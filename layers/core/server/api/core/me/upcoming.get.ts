// What I have coming (AC-3): tickets, shifts and anything else a module contributes to
// core.upcoming, the soonest first.
import { defineRoute } from '#kit'
import { upcomingFor } from '../../../interface/upcoming'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({ items: await upcomingFor(actor) }))
