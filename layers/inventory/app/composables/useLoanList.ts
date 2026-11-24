// The loans list's tabs (S4): requests, approved, out and overdue, with finished loans apart.
import type { LoanRow } from '../../shared/loans'

export const LOAN_TABS = ['requested', 'approved', 'out', 'overdue'] as const
export type LoanTab = typeof LOAN_TABS[number]
const FINISHED = new Set(['returned', 'declined', 'cancelled'])

export function useLoanList(loans: Ref<LoanRow[] | undefined>) {
  // Overdue as of when the list was loaded; the list reloads with the page.
  const now = Date.now()
  const tab = ref<LoanTab>('requested')
  const overdue = (l: LoanRow) => l.state === 'out' && l.dueBackAt < now
  const tabOf = (l: LoanRow): LoanTab | null => FINISHED.has(l.state) || l.state === 'draft' ? null : overdue(l) ? 'overdue' : l.state as LoanTab
  const counts = computed(() => Object.fromEntries(LOAN_TABS.map(k => [k, (loans.value ?? []).filter(l => tabOf(l) === k).length])) as Record<LoanTab, number>)
  const shown = computed(() => (loans.value ?? []).filter(l => tabOf(l) === tab.value))
  const finished = computed(() => (loans.value ?? []).filter(l => FINISHED.has(l.state)))
  return { tab, counts, shown, finished, overdue }
}
