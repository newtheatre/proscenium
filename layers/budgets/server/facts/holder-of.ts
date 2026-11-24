// budgets.holder-of: named as a holder of this budget (BC-14). Mapped to budgets.budget.hold by default.
import { defineFact } from '#kit'
import { holderIds, holds } from '../holders'

export default defineFact(async (actor, record) => {
  if (actor.kind !== 'person' || !actor.accountId) return false
  if (!record || record.type !== 'budgets.budget' || !record.id) return false
  return holds(actor.accountId, record.id)
}, {
  holders: async record => (record?.type === 'budgets.budget' && record.id ? holderIds(record.id) : []),
})
