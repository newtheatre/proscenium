// A production's kit (S15): its pull lists and loans, shared by the Kit tab and the summary fact,
// and starting a pull list for a department, which opens the new list.
import type { KitList, ProductionKit } from '../../shared/pull-lists'

const LIVE = new Set(['draft', 'requested', 'approved', 'out'])

export function useProductionKit(productionId: () => string) {
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const fetched = useAPI<ProductionKit>(() => `/api/inventory/productions/${encodeURIComponent(productionId())}/kit`, { key: `inventory:kit:${productionId()}` })
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const form = reactive({ departmentId: undefined as string | undefined, startsOn: '', dueBackOn: '' })

  const lists = computed(() => fetched.data.value?.lists ?? [])
  const totals = computed(() => {
    // Overdue as of when the kit was loaded; it reloads with the page.
    const now = Date.now()
    const live = lists.value.filter(l => LIVE.has(l.state))
    return { lists: live.length, out: live.reduce((n, l) => n + l.out, 0), overdue: live.filter(l => l.state === 'out' && l.dueBackAt < now).reduce((n, l) => n + l.out, 0) }
  })
  const departmentItems = computed(() => (fetched.data.value?.startable ?? []).map(d => ({ value: d.id, label: d.name })))

  function prepare() {
    refusal.value = null
    Object.assign(form, { departmentId: departmentItems.value[0]?.value, startsOn: fetched.data.value?.today ?? '', dueBackOn: '' })
  }

  async function start(): Promise<void> {
    refusal.value = null
    try {
      const { loanId } = await $api<{ loanId: string }>('/api/inventory/pull-lists', { method: 'POST', body: { productionId: productionId(), ...form } })
      await navigateTo(`/console/inventory/loans/${loanId}`)
    }
    catch (e) {
      refusal.value = toRefusal(e)
    }
  }

  const counts = (l: KitList) => ({ wanted: l.wanted, listed: l.listed + l.promised, out: l.out })
  return { ...fetched, lists, totals, departmentItems, form, refusal, prepare, start, counts }
}
