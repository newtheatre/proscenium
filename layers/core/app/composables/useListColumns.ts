// Which optional columns a list shows is kept on this device, for each list (UI-11). It is not in
// the address and not a setting. Browser storage can be absent or refuse, so the list then simply
// shows its declared columns.
import type { ListDeclaration } from '../../shared/list'

const key = (id: string) => `core:list-columns:${id}`

export function useListColumns(list: Pick<ListDeclaration, 'id' | 'columns'>) {
  const declared = () => Object.entries(list.columns).filter(([, c]) => c.hidden && !c.always).map(([k]) => k)
  const hidden = ref<string[]>(declared())

  onMounted(() => {
    try {
      const stored = localStorage.getItem(key(list.id))
      if (stored) hidden.value = (JSON.parse(stored) as string[]).filter(k => k in list.columns && !list.columns[k]!.always)
    }
    catch { /* the declared columns stand */ }
  })

  function toggle(column: string, shown: boolean) {
    const next = new Set(hidden.value)
    if (shown) next.delete(column)
    else next.add(column)
    hidden.value = [...next]
    try { localStorage.setItem(key(list.id), JSON.stringify(hidden.value)) }
    catch { /* not kept: it holds for this visit */ }
  }
  return { hidden, toggle }
}
