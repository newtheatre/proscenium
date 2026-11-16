// A link back to a list lands on the list as it was left: the same view, filters, search, sort and
// page. The address of each list is kept for the session of this tab (breadcrumbs, back links and
// forms that return to their list all read it). Session storage can be absent or refuse, so the
// memory then lasts until the page is reloaded.
const KEY = 'core:list-memory'

export function useListMemory() {
  const memory = useState<Record<string, string>>(KEY, () => ({}))

  onMounted(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Record<string, string>
      memory.value = { ...stored, ...memory.value }
    }
    catch { /* nothing remembered */ }
  })

  function remember(path: string, fullPath: string) {
    memory.value = { ...memory.value, [path]: fullPath }
    if (import.meta.client) {
      try { sessionStorage.setItem(KEY, JSON.stringify(memory.value)) }
      catch { /* kept for this page only */ }
    }
  }
  /** The address a list was left at, or the link as given. */
  const recall = (to: string) => memory.value[to.split('?')[0]!] ?? to
  return { remember, recall }
}
