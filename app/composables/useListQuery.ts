import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import { encodeCondition, fieldOf, parseCondition, saysCondition } from '#shared/utils/list-filters'
import type { FieldKey, FilterCondition, FilterOption, ListSpec, SortDirection } from '#shared/utils/list-filters'
import type { MaybeRefOrGetter } from 'vue'

// A console list's search, filters, sort and page live in the route query, so a filtered list
// can be linked, refreshed and returned to (K-129 criterion 4). Changing a filter resets the page.

export interface ListSort {
  key: string
  direction: SortDirection
}

export interface ListQueryOptions {
  // Labels for the fields whose options are only known at runtime (a season, a category).
  options?: MaybeRefOrGetter<Record<string, FilterOption[]> | undefined>
}

const RESERVED = ['page', 'pageSize', 'search', 'sort', 'direction']

export function useListQuery<S extends ListSpec>(spec: S, settings: ListQueryOptions = {}) {
  const route = useRoute()
  const router = useRouter()

  // The route query as one string per key; a repeated key keeps its first value.
  const current = computed<Record<string, string>>(() => {
    const flat: Record<string, string> = {}
    for (const [key, value] of Object.entries(route.query)) {
      const first = Array.isArray(value) ? value[0] : value
      if (typeof first === 'string') flat[key] = first
    }
    return flat
  })
  const one = (key: string): string | undefined => current.value[key]

  // A value the schema would refuse is dropped here too, so the request never carries it.
  const conditions = computed<FilterCondition[]>(() => spec.fields.flatMap((field) => {
    const raw = one(field.key)
    if (!raw) return []
    const parsed = parseCondition(field, raw)
    return 'condition' in parsed ? [parsed.condition] : []
  }))

  const defaultDirection: SortDirection = spec.sort.direction ?? 'asc'

  const sort = computed<ListSort>(() => {
    const key = one('sort')
    const direction = one('direction')
    return {
      key: spec.sort.fields.some(field => field.key === key) ? key! : spec.sort.default,
      direction: direction === 'desc' || direction === 'asc' ? direction : defaultDirection,
    }
  })

  function write(patch: Record<string, string | undefined>, mode: 'push' | 'replace'): void {
    const merged: Record<string, string | undefined> = { ...current.value, ...patch }
    const next = Object.fromEntries(Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== undefined))
    if (JSON.stringify(next) === JSON.stringify(current.value)) return
    void router[mode]({ query: next })
  }

  const page = computed<number>({
    get() {
      const number = Number(one('page'))
      return Number.isInteger(number) && number > 0 ? number : 1
    },
    set(number) {
      write({ page: number > 1 ? String(number) : undefined }, 'push')
    },
  })

  // The box is immediate and the URL follows it after a pause (criterion 2, useDebounced).
  const settledSearch = computed(() => one('search') ?? '')
  const search = ref(settledSearch.value)
  const debounced = useDebounced(search, 250)
  watch(debounced, (value) => {
    const trimmed = value.trim()
    if (trimmed !== settledSearch.value) write({ search: trimmed || undefined, page: undefined }, 'replace')
  })
  watch(settledSearch, (value) => {
    if (value !== search.value.trim()) search.value = value
  })

  function set(key: FieldKey<S>, condition: FilterCondition | null): void {
    write({ [key]: condition ? encodeCondition(condition) : undefined, page: undefined }, 'push')
  }

  function setSort(next: ListSort): void {
    write({
      sort: next.key === spec.sort.default ? undefined : next.key,
      direction: next.direction === defaultDirection ? undefined : next.direction,
      page: undefined,
    }, 'push')
  }

  function clearSearch(): void {
    search.value = ''
    write({ search: undefined, page: undefined }, 'replace')
  }

  function clear(): void {
    search.value = ''
    const fields = Object.fromEntries(spec.fields.map(field => [field.key, undefined]))
    write({ ...fields, search: undefined, page: undefined }, 'push')
  }

  // What the endpoint is asked, the same encoding the URL holds. A key the page does not own is
  // passed through, so an obsolete link is refused by the schema rather than quietly widened.
  const encoded = computed<string>(() => {
    const asked: Record<string, string | number> = { page: page.value, sort: sort.value.key, direction: sort.value.direction }
    if (settledSearch.value) asked.search = settledSearch.value
    for (const condition of conditions.value) asked[condition.key] = encodeCondition(condition)
    for (const [key, value] of Object.entries(current.value)) {
      if (!RESERVED.includes(key) && !fieldOf(spec, key)) asked[key] = value
    }
    return JSON.stringify(asked)
  })
  // Keyed on the string, so a watcher on it fires only when the question actually changes.
  const query = computed<Record<string, string | number>>(() => JSON.parse(encoded.value) as Record<string, string | number>)

  const active = computed<ActiveFilter[]>(() => {
    const chips: ActiveFilter[] = []
    if (settledSearch.value) {
      chips.push({ key: 'search', label: `Matching ${settledSearch.value}`, icon: 'i-lucide-search', clear: clearSearch })
    }
    const labels = toValue(settings.options)
    for (const condition of conditions.value) {
      const field = fieldOf(spec, condition.key)!
      chips.push({
        key: condition.key,
        label: saysCondition(field, condition, labels?.[condition.key]),
        icon: field.icon ?? 'i-lucide-filter',
        clear: () => set(condition.key as FieldKey<S>, null),
      })
    }
    return chips
  })

  return {
    search,
    conditions,
    sort,
    page,
    query,
    active,
    filtered: computed(() => active.value.length > 0),
    set,
    setSort,
    clear,
  }
}
