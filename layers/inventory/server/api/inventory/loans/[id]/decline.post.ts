// Declines a requested loan with an optional note to the borrower, releasing every line (INV-19, L17).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { declineInput } from '../../../../../shared/loans'
import { declineLoan } from '../../../../loans'
import { loanOf } from '../../../../lending'

export default defineRoute({
  ability: 'inventory.loan.approve',
  record: event => ['inventory.loan', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: declineInput,
}, async (event, { input, unit, actor }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  await declineLoan(unit.view(), loan, actor.accountId ?? '', input.note)
  unit.audit({ action: 'update', record: ['inventory.loan', loan.id], detail: { to: 'declined' } })
  return { loanId: loan.id }
})
