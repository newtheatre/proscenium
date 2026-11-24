// One loan (S5): who has it, its window and its lines, each saying whether its item is free then.
// The department's people see it through their grants, a production's through its pull list (L5).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { loanDetail } from '../../../../loan-reading'
import { requireView } from '../../../../loan-access'
import { loanOf } from '../../../../lending'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor, unit }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  const access = await requireView(actor, loan)
  // loan.view is audited on read; reading through the production is audited the same way.
  unit.audit({ action: 'read', record: ['inventory.loan', loan.id] })
  return {
    loan: await loanDetail(loan.id, {
      approve: access.approve,
      edit: access.gather,
      cancel: access.approve || (access.listEditor && loan.state === 'draft'),
      submit: access.listEditor && loan.state === 'draft',
    }),
  }
})
