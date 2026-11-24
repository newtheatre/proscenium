// Checks promised lines out to whoever collects, with their training checked now (INV-22, L11, K2 to K5).
import { getRouterParam } from 'h3'
import { defineRoute, requireAbility } from '#kit'
import { checkOutInput } from '../../../../../../shared/desk'
import { checkOut } from '../../../../../desk'
import { loanOf } from '../../../../../lending'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: checkOutInput,
}, async (event, { input, actor, unit }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  await requireAbility(actor, 'inventory.loan.issue', ['inventory.department', loan.departmentId])
  return { checkedOut: await checkOut(unit.view(), actor, loan, input) }
})
