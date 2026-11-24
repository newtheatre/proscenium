// One venue's emergency card, for its page in live mode (FH-26); the list keeps every card on the
// device. Opening it is a practice task (FH-55), so in a practice store the checks run after it.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { getCard } from '../../../emergency'

export default defineRoute({
  ability: 'front-of-house.emergency-card.view',
  rateLimit: 'default',
  practice: 'ticks',
}, async event => ({ card: await getCard(getRouterParam(event, 'venueId')!) }))
