// Adds a line to a loan not yet approved: an item of its department, or what is wanted in words (L2, L6).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { lineInput } from '../../../../../../shared/loans'
import { addLine } from '../../../../../loans'
import { loanOf } from '../../../../../lending'

export default defineRoute({
  ability: 'inventory.loan.approve',
  record: event => ['inventory.loan', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: lineInput,
}, async (event, { input, unit }) => ({ lineId: addLine(unit.view(), await loanOf(getRouterParam(event, 'id')!), input) }))
