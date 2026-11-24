// Matches a wanted line to an item (INV-18, L6): listed before approval, promised after it.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { matchInput } from '../../../../../../../shared/pull-lists'
import { requireGather } from '../../../../../../loan-access'
import { loanOf } from '../../../../../../lending'
import { matchLine } from '../../../../../../pull-lists'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: matchInput,
}, async (event, { input, actor, unit }) => {
  const loan = await loanOf(getRouterParam(event, 'id')!)
  await requireGather(actor, loan)
  await matchLine(unit.view(), loan, getRouterParam(event, 'lineId')!, input)
  return { matched: true }
})
