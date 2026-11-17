// The memberships the viewer holds now and may show as a card, for the card on the members' area
// home: none while the card is switched off (membership.card.show).
import { useSetting, type Actor } from '#kit'
import { currentMemberships } from '../../memberships'

export default {
  async value(actor: Actor) {
    if (!actor.accountId || await useSetting('membership.card.show') === false) return 0
    return (await currentMemberships(actor.accountId)).length
  },
}
