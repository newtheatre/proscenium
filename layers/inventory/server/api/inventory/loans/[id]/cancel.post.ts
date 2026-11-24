// Cancels a loan that is not yet out, releasing its lines (L16).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { z } from 'zod'
import { cancelLoan } from '../../../../loans'
import { loanOf } from '../../../../lending'

export default defineRoute({
  ability: 'inventory.loan.approve',
  record: event => ['inventory.loan', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { unit, actor }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  await cancelLoan(unit.view(), loan, actor.accountId ?? null, 'by-staff')
  unit.audit({ action: 'update', record: ['inventory.loan', loan.id], detail: { to: 'cancelled' } })
  return { loanId: loan.id }
})
