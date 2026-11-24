// Submits a draft pull list to its department, which approves it all or none (L4, L5, L6).
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { z } from 'zod'
import { loanAccess } from '../../../../loan-access'
import { loanOf } from '../../../../lending'
import { submitPullList } from '../../../../pull-lists'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { unit, actor }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  if (!(await loanAccess(actor, loan)).listEditor) refuse('core.access.denied', 'Only the production\'s people submit its pull list.', { status: 403 })
  submitPullList(unit.view(), loan, actor.accountId ?? null)
  unit.audit({ action: 'update', record: ['inventory.loan', loan.id], detail: { to: 'requested' } })
  return { loanId: loan.id }
})
