// The items list's filters and search (S1): department, category, location (and everything inside it),
// state and "inspection due", over the rows the server sent. A typed or scanned tag opens its item.
import type { ItemRow, ItemsList } from '../../shared/items'
import { ITEM_STATES } from '../../shared/states'

const ALL = 'all'

export function useItemFilters(list: Ref<ItemsList | null | undefined>) {
  const { t } = useT()
  const filters = reactive({ departmentId: ALL, categoryId: ALL, locationId: ALL, state: ALL, due: false })
  const q = ref('')

  const departmentItems = computed(() => [{ value: ALL, label: t('inventory.items.all-departments') }, ...(list.value?.departments ?? []).map(d => ({ value: d.id, label: d.name }))])
  const categoryItems = computed(() => [{ value: ALL, label: t('inventory.items.all-categories') }, ...(list.value?.categories ?? [])
    .filter(c => filters.departmentId === ALL || c.departmentId === filters.departmentId).map(c => ({ value: c.id, label: c.name }))])
  const locationItems = computed(() => [{ value: ALL, label: t('inventory.items.all-locations') }, ...locationTree(list.value?.locations ?? []).map(r => ({ value: r.location.id, label: r.path }))])
  const stateItems = computed(() => [{ value: ALL, label: t('inventory.items.all-states') }, ...ITEM_STATES.map(s => ({ value: s, label: t(`inventory.item-states.${s}`) }))])
  watch(() => filters.departmentId, () => { filters.categoryId = ALL })

  const inside = computed(() => filters.locationId === ALL ? null : insideOf(list.value?.locations ?? [], filters.locationId))
  const words = computed(() => q.value.trim().toLowerCase())
  const isDue = (i: ItemRow) => !!i.nextDueOn && !!list.value && i.nextDueOn <= list.value.dueBy
  const matches = (i: ItemRow) => (filters.departmentId === ALL || i.departmentId === filters.departmentId)
    && (filters.categoryId === ALL || i.categoryId === filters.categoryId)
    && (!inside.value || inside.value.has(i.locationId))
    && (filters.state === ALL || i.state === filters.state)
    && (!filters.due || isDue(i))
    && (!words.value || i.tag.toLowerCase().includes(words.value) || i.name.toLowerCase().includes(words.value))

  const rows = computed(() => (list.value?.items ?? []).filter(matches))
  const current = computed(() => rows.value.filter(i => i.state !== 'disposed'))
  const disposed = computed(() => rows.value.filter(i => i.state === 'disposed'))
  const narrowed = computed(() => !!words.value || filters.due || [filters.departmentId, filters.categoryId, filters.locationId, filters.state].some(v => v !== ALL))
  // The whole tag, as on a label: opening it saves a click when scanning.
  const exact = computed(() => (list.value?.items ?? []).find(i => i.tag.toLowerCase() === words.value))

  return { filters, q, departmentItems, categoryItems, locationItems, stateItems, current, disposed, narrowed, exact, isDue }
}
