// Your companies (CO-08): the engagements of the companies the person signed in acts for, with what they owe.
import { defineRoute } from '#kit'
import { myEngagements } from '../../mine'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({ engagements: await myEngagements(actor.accountId!) }))
