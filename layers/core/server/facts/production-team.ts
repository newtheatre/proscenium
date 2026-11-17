// core.production-team (part 6): the account is credited on the production, until
// core.programme.team-standing-after has passed since its last performance ended. A standing, so a
// cast member reaches the members' side; it grants nothing unless a theatre maps abilities to it.
import { defineFact } from '#kit'
import { onProductionTeam, productionTeamHolders } from '../programme/credits'

export default defineFact(async (actor, record) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  if (record && record.type !== 'core.production') return false
  return onProductionTeam(actor.accountId, record?.id)
}, {
  holders: async record => productionTeamHolders(record?.type === 'core.production' ? record.id : undefined),
})
