// One of my loans (S14, INV-27), read-only; a request may still be cancelled. Ownership opens it.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { loanDetail } from '../../../../loan-reading'
import { loanOf } from '../../../../lending'

export default defineRoute({
  ability: 'inventory.loan.view',
  record: event => ['inventory.loan', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (event, { actor }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  const mine = loan.responsibleAccountId === actor.accountId
  return { loan: await loanDetail(loan.id, { approve: false, edit: false, cancel: mine && loan.state === 'requested', submit: false }) }
})
