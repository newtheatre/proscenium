// Who may do what to one loan: the department through its grants, and a production's people
// through `inventory.pull-list.edit` on the production while its pull list is a draft (L5).
import { can, refuse, type Actor } from '#kit'
import type { Loan } from './loans'

export interface LoanAccess { view: boolean, approve: boolean, gather: boolean, listEditor: boolean }

const DENIED = { status: 403, remedy: 'Ask the department or the production lead.' }

export async function loanAccess(actor: Actor, loan: Pick<Loan, 'id' | 'state' | 'productionId'>): Promise<LoanAccess> {
  const record = ['inventory.loan', loan.id] as const
  const approve = (await can(actor, 'inventory.loan.approve', record)).allowed
  const view = approve || (await can(actor, 'inventory.loan.view', record)).allowed
  const listEditor = !!loan.productionId && (await can(actor, 'inventory.pull-list.edit', ['core.production', loan.productionId])).allowed
  const gather = approve ? ['draft', 'requested', 'approved'].includes(loan.state) : listEditor && loan.state === 'draft'
  return { view: view || listEditor, approve, gather, listEditor }
}

export async function requireView(actor: Actor, loan: Loan): Promise<LoanAccess> {
  const access = await loanAccess(actor, loan)
  if (!access.view) refuse('core.access.denied', 'You do not have permission to see this loan.', DENIED)
  return access
}

/** Adding, matching and taking off lines: the department before the loan goes out, the production while it is a draft. */
export async function requireGather(actor: Actor, loan: Loan): Promise<LoanAccess> {
  const access = await loanAccess(actor, loan)
  if (!access.gather) refuse('core.access.denied', 'You cannot change this loan\'s lines now.', DENIED)
  return access
}
