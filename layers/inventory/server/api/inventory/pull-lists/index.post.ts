// Starts a production's pull list for one department (INV-17, L2, L5), from the production's Kit tab.
import { defineRoute, requireAbility } from '#kit'
import { startPullListInput } from '../../../../shared/pull-lists'
import { startPullList } from '../../../pull-lists'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: startPullListInput,
}, async (_event, { input, actor, unit }) => {
  await requireAbility(actor, 'inventory.pull-list.edit', ['core.production', input.productionId])
  return { loanId: await startPullList(unit.view(), input, actor.accountId ?? '') }
})
