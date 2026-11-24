// Lending straight from a department (INV-21): the form's state, the department's lendable kit to
// choose from, and the send. A clash comes back naming each item in the way.
import type { ItemsList } from '../../shared/items'

export function useLendForm(departments: Ref<{ id: string, name: string }[]>) {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const { toRefusal } = useRefusal()
  const { data: catalogue } = useAPI<ItemsList>('/api/inventory/items', { key: 'inventory:items' })
  const form = reactive({
    departmentId: departments.value[0]?.id as string | undefined, kind: 'outside' as 'member' | 'outside', borrowerAccountId: undefined as string | undefined,
    borrowerName: '', borrowerEmail: '', purpose: '', dates: { start: '', end: '' }, itemIds: [] as string[],
  })
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  watch(() => form.departmentId, () => { form.itemIds = [] })

  const itemItems = computed(() => (catalogue.value?.items ?? [])
    .filter(i => i.departmentId === form.departmentId && i.lendable && i.state === 'active')
    .map(i => ({ value: i.id, label: `${i.tag} · ${i.name}` })))
  const kindItems = computed(() => (['outside', 'member'] as const).map(v => ({ value: v, label: t(`inventory.lend.kind.${v}`) })))
  // The items in the way, by name, from the refusal's detail.
  const clashes = computed(() => Object.keys(refusal.value?.detail ?? {}).map(id => itemItems.value.find(i => i.value === id)?.label ?? id))

  async function send(): Promise<string | null> {
    refusal.value = null
    try {
      const { loanId } = await $api<{ loanId: string }>('/api/inventory/loans', { method: 'POST', body: {
        departmentId: form.departmentId, kind: form.kind, borrowerAccountId: form.kind === 'member' ? form.borrowerAccountId : null,
        borrowerName: form.kind === 'outside' ? form.borrowerName : null, borrowerEmail: form.kind === 'outside' ? form.borrowerEmail : null,
        purpose: form.purpose, startsOn: form.dates.start, dueBackOn: form.dates.end, itemIds: form.itemIds,
      } })
      return loanId
    }
    catch (e) {
      refusal.value = toRefusal(e)
      return null
    }
  }

  return { form, refusal, itemItems, kindItems, clashes, send }
}
