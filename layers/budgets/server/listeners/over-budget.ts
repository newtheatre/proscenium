// A claim or request decided moves a line's spent or committed: holders hear once when it goes over (BC-34).
import { defineListener } from '#kit'
import { budgetsTouched, checkOverBudget } from '../sweeps'

export default defineListener(async (event, unit) => {
  for (const budget of await budgetsTouched(event.payload as { claimId?: string, requestId?: string })) await checkOverBudget(unit, budget)
})
