// What the loan page (S5) does: approve, decline with a note, cancel, submit a pull list, and add
// or take off lines, each a write that keeps its refusal for the page to show and reloads the loan.
import type { LoanDetail, LoanLine } from '../../shared/loans'

export function useLoanPage(loan: Ref<LoanDetail | null | undefined>, refresh: () => Promise<unknown>) {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const toast = useToast()
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const base = computed(() => `/api/inventory/loans/${loan.value?.id}`)

  async function write(path: string, body: object, done: string, method: 'POST' | 'DELETE' = 'POST'): Promise<boolean> {
    refusal.value = null
    try {
      await $api(`${base.value}${path}`, { method, body: method === 'POST' ? body : undefined })
      toast.add({ title: done, color: 'success' })
      await refresh()
      return true
    }
    catch (e) {
      refusal.value = toRefusal(e)
      await refresh()
      return false
    }
  }

  const approve = () => write('/approve', {}, t('inventory.loan.approved'))
  const decline = (note: string) => write('/decline', { note }, t('inventory.loan.declined'))
  const cancel = () => write('/cancel', {}, t('inventory.loan.cancelled'))
  const submit = () => write('/submit', {}, t('inventory.loan.submitted'))
  const addLine = (line: { itemId?: string, wanted?: string }) => write('/lines', line, t('inventory.loan.line-added'))
  const removeLine = (line: LoanLine) => write(`/lines/${line.id}`, {}, t('inventory.loan.line-removed'), 'DELETE')

  const open = computed(() => !!loan.value && ['draft', 'requested'].includes(loan.value.state))
  // The department approves a request, or a pull list straight from its draft; the production submits its draft.
  const primary = computed(() => {
    const l = loan.value
    if (l?.can.approve && open.value) return { label: t('inventory.loan.approve'), icon: 'i-lucide-check', run: approve }
    if (l?.can.submit) return { label: t('inventory.loan.submit'), icon: 'i-lucide-send', run: submit }
    return undefined
  })
  // A wanted line is matched before the loan goes out: listed, or promised once approved (L6).
  const matchable = (line: LoanLine) => !!loan.value?.can.edit && line.state === 'wanted'
  return { refusal, approve, decline, cancel, addLine, removeLine, open, primary, matchable }
}
