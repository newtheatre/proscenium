// Search, filters, view, sort and page read from and written to the address (UI-11), against a
// list's declaration. Changes made while the Filters panel is open make one history entry between
// them, so Back undoes the visit to the panel and not each field.
import type { MaybeRefOrGetter } from 'vue'
import { parseList, serialiseList, type ListDeclaration, type ListState } from '../../shared/list'

type Declared = Pick<ListDeclaration, 'filters' | 'sorts' | 'defaultView' | 'defaultSort' | 'views'>

export function useListQuery(declaration: MaybeRefOrGetter<Declared>) {
  const list = computed(() => toValue(declaration))
  const route = useRoute()
  const router = useRouter()
  const state = computed(() => parseList(route.query as Record<string, string | string[]>, list.value))

  // True from the first change made in a visit to the panel until the panel closes.
  let visiting = false
  /** The Filters panel opening or closing starts a new visit. */
  const endVisit = () => { visiting = false }

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
    const query = serialiseList(next, list.value)
    return options.replace ? router.replace({ query }) : router.push({ query })
  }

  /** The first change in a visit adds the entry; the rest of the visit replaces it. */
  function setInPanel(patch: Partial<ListState>) {
    const first = !visiting
    visiting = true
    return set(patch, { replace: !first })
  }

  const clear = () => router.push({ query: {} })
  return { state, set, setInPanel, endVisit, clear }
}
