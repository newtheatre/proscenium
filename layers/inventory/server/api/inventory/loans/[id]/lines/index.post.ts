// Adds a line to a loan not yet approved: an item of its department, or what is wanted in words (L2, L5, L6).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { lineInput } from '../../../../../../shared/loans'
import { requireGather } from '../../../../../loan-access'
import { addLine } from '../../../../../loans'
import { loanOf } from '../../../../../lending'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: lineInput,
}, async (event, { input, unit, actor }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  await requireGather(actor, loan)
  const lineId = addLine(unit.view(), loan, input)
  unit.audit({ action: 'update', record: ['inventory.loan', loan.id], detail: { addedLine: lineId } })
  return { lineId }
})
