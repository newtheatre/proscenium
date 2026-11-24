// Borrow kit (S12): the catalogue, asked again when the dates change, searched and grouped by department.
import type { CatalogueItem } from '../../shared/borrowing'

export function useCatalogue(dates: Ref<{ start: string, end: string }>) {
  const q = ref('')
  const query = computed(() => dates.value.start && dates.value.end ? { startsOn: dates.value.start, dueBackOn: dates.value.end } : {})
  const fetched = useAPI<{ items: CatalogueItem[] }>('/api/inventory/catalogue', { key: 'inventory:catalogue', query })
  const words = computed(() => q.value.trim().toLowerCase())
  const groups = computed(() => {
    const shown = (fetched.data.value?.items ?? []).filter(i => !words.value || `${i.name} ${i.tag} ${i.category}`.toLowerCase().includes(words.value))
    const by = new Map<string, { department: string, items: CatalogueItem[] }>()
    for (const i of shown) by.set(i.departmentId, { department: i.department, items: [...by.get(i.departmentId)?.items ?? [], i] })
    return [...by.values()]
  })
  return { ...fetched, q, groups }
}
