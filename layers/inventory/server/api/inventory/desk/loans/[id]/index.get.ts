// One loan at the kit desk (S6): its lines with what each needs of the person collecting, checked now (K2, K3).
import { getRouterParam } from 'h3'
import { can, defineRoute, requireAbility } from '#kit'
import { z } from 'zod'
import { deskLoan } from '../../../../../desk-reading'
import { loanOf } from '../../../../../lending'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ collector: z.string().min(1).max(40).optional() }), // not-policy: shape bound
}, async (event, { input, actor }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  const department = ['inventory.department', loan.departmentId] as const
  await requireAbility(actor, 'inventory.loan.issue', department)
  return { loan: await deskLoan(loan.id, (await can(actor, 'inventory.requirement.override', department)).allowed, input.collector ?? null) }
})
