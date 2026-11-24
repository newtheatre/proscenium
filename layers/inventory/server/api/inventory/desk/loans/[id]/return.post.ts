// Takes lines back, in part, lost or damaged; damage opens a fault (INV-23, L13 to L15).
import { getRouterParam } from 'h3'
import { defineRoute, requireAbility } from '#kit'
import { returnInput } from '../../../../../../shared/desk'
import { returnLines } from '../../../../../desk'
import { loanOf } from '../../../../../lending'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: returnInput,
}, async (event, { input, actor, unit }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  await requireAbility(actor, 'inventory.loan.issue', ['inventory.department', loan.departmentId])
  await returnLines(unit.view(), actor.accountId ?? null, loan, input)
  return { returned: input.lines.length }
})
