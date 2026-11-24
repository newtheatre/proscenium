// Cancels a loan that is not yet out, releasing its lines (L16); a production cancels its own draft
// pull list, a member their own request.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { z } from 'zod'
import { loanAccess } from '../../../../loan-access'
import { cancelLoan } from '../../../../loans'
import { loanOf } from '../../../../lending'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { unit, actor }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  const access = await loanAccess(actor, loan)
  // The borrower cancels their own request (L16, INV-27); exact, as ownership is for opening it too.
  const own = loan.state === 'requested' && loan.kind === 'member' && loan.responsibleAccountId === actor.accountId
  if (!access.approve && !own && !(access.listEditor && loan.state === 'draft')) refuse('core.access.denied', 'You cannot cancel this loan.', { status: 403 })
  await cancelLoan(unit.view(), loan, actor.accountId ?? null, access.approve ? 'by-staff' : 'by-borrower')
  unit.audit({ action: 'update', record: ['inventory.loan', loan.id], detail: { to: 'cancelled' } })
  return { loanId: loan.id }
})
