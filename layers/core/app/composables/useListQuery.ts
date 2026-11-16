// Filters, sort and page read from and written to the address (UI-11).
import { parseList, serialiseList, type ListState } from '../../shared/list'

export function useListQuery(filterNames: readonly string[], defaults: Partial<Pick<ListState, 'sort' | 'order' | 'pageSize'>> = {}) {
  const route = useRoute()
  const router = useRouter()
  const state = computed(() => parseList(route.query as Record<string, string | string[]>, filterNames, defaults))

  /** Changing a filter, the sort or the page adds a history entry, so Back restores the previous list. */
  function set(patch: Partial<ListState>, options: { replace?: boolean } = {}) {
    const next: ListState = {
      ...state.value,
      ...patch,
      filters: { ...state.value.filters, ...(patch.filters ?? {}) },
    }
    // Anything but a page change starts again at page one.
    if (patch.page === undefined) next.page = 1
    for (const [name, value] of Object.entries(next.filters)) if (!value) Reflect.deleteProperty(next.filters, name)
    const query = serialiseList(next, defaults)
    return options.replace ? router.replace({ query }) : router.push({ query })
  }

  const clear = () => router.push({ query: {} })
  return { state, set, clear }
}
