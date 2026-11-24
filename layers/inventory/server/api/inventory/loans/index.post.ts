// Lends kit straight from a department (INV-21): to a member or an outside borrower, approved and
// promised in one unit (L4, L7). Only someone who may approve the department's loans lends this way.
import { defineRoute, requireAbility } from '#kit'
import { lendInput } from '../../../../shared/loans'
import { lend } from '../../../lending'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: lendInput }, async (_event, { input, unit, actor }) => {
  await requireAbility(actor, 'inventory.loan.approve', ['inventory.department', input.departmentId])
  return { loanId: await lend(unit.view(), input, actor.accountId ?? null) }
})
