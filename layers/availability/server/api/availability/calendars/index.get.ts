// S14: the person's own calendar connections, which kinds are offered, and how many they may have.
import { defineRoute, useSetting } from '#kit'
import { myConnections } from '../../../calendars'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => ({
  offers: { ics: !!await useSetting('availability.import.ics') },
  max: Number(await useSetting('availability.import.max-connections')),
  connections: await myConnections(actor.accountId!),
}))
