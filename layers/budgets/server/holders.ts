// A budget's holders (BC-14): people given the Budget holder role on it, which a module's preset makes
// when Budgets is switched on. A theatre may rename the role; its key stays.
import { grantsOn, type RecordGrant } from '#modules/core'

export const HOLDER_ROLE = 'budget-holder'

export function holdersOn(budgetId: string): Promise<RecordGrant[]> {
  return grantsOn(['budgets.budget', budgetId])
}
