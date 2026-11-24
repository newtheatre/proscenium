// Approves a requested loan, promising every listed line or none (INV-19, L7).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { z } from 'zod'
import { approveLoan } from '../../../../loans'

export default defineRoute({
  ability: 'inventory.loan.approve',
  record: event => ['inventory.loan', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { unit, actor }) => {
  const id = getRouterParam(event, 'id')!
  await approveLoan(unit.view(), id, actor.accountId ?? '')
  unit.audit({ action: 'update', record: ['inventory.loan', id], detail: { to: 'approved' } })
  return { loanId: id }
})
