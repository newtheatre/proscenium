// The signed-in person's places on sessions not yet over. Only ever the caller's rows.
import { defineRoute } from '#kit'
import { placesOfPerson } from '../../../sessions'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (_event, { actor }) => ({ places: await placesOfPerson(actor.accountId!) }))
