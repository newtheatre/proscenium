// Every venue's emergency card, for the device to keep so it opens with no signal (FH-26).
import { defineRoute } from '#kit'
import { listCards } from '../../../emergency'

export default defineRoute({
  ability: 'front-of-house.emergency-card.view',
  rateLimit: 'default',
}, async () => ({ cards: await listCards() }))
