// A member asks to borrow kit (S13, INV-20, L2, L4): one request per department, each for it to decide.
import { defineRoute } from '#kit'
import { requestKitInput } from '../../../../shared/borrowing'
import { requestKit, requireBrowsing } from '../../../borrowing'

export default defineRoute({
  ability: 'inventory.loan.request',
  rateLimit: 'write',
  idempotent: true,
  input: requestKitInput,
}, async (_event, { input, actor, unit }) => {
  await requireBrowsing()
  return { loanIds: await requestKit(unit.view(), actor.accountId!, input) }
})
