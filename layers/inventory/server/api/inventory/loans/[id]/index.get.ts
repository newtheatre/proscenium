// One loan (S5): who has it, its window and its lines, each saying whether its item is free then.
import { getRouterParam } from 'h3'
import { can, defineRoute } from '#kit'
import { loanDetail } from '../../../../loan-reading'

export default defineRoute({
  ability: 'inventory.loan.view',
  record: event => ['inventory.loan', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (event, { actor }) => {
  const id = getRouterParam(event, 'id')!
  const approve = (await can(actor, 'inventory.loan.approve', ['inventory.loan', id])).allowed
  return { loan: await loanDetail(id, { approve, edit: approve, cancel: approve }) }
})
