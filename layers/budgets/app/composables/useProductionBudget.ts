// A production's budget for its Budget tab and fact (BC-11): one fetch, shared by both.
interface Figures { budgetedMinor: number, committedMinor: number, actualMinor: number, remainingMinor: number, over: boolean }
interface Totals { budgetedMinor: number, committedMinor: number, actualMinor: number, remainingMinor: number, incomeBudgetedMinor: number, incomeActualMinor: number }
export interface ProductionBudget {
  budget: { id: string, name: string, state: 'draft' | 'proposed' | 'approved' | 'closed', currency: string } | null
  lines?: { id: string, name: string, kind: 'expense' | 'income', figures: Figures }[]
  totals?: Totals
  closeDue?: boolean
  canManage: boolean
}

export function useProductionBudget(productionId: () => string) {
  return useAPI<ProductionBudget>(() => `/api/budgets/productions/${productionId()}`, { key: `budgets:production:${productionId()}` })
}
