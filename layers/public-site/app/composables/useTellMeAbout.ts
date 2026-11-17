// The visitor's "tell me about" list (C-58): content warnings they always want to know about,
// kept in this browser only so the theatre never holds a record of what a named person finds hard.
// Until the browser has been read, the list is empty, so the server-rendered page is the same for everyone.
const KEY = 'proscenium.tell-me-about'

export function useTellMeAbout() {
  const ids = useState<string[]>('tell-me-about', () => [])
  const ready = useState('tell-me-about-ready', () => false)

  function load() {
    if (ready.value || !import.meta.client) return
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]')
      if (Array.isArray(stored)) ids.value = stored.filter((v): v is string => typeof v === 'string').slice(0, 200) // not-policy: a sanity ceiling on a stored list
    }
    catch { /* a blocked or cleared store: the list stays empty */ }
    ready.value = true
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids.value))
    }
    catch { /* blocked: the list lasts for this visit only */ }
  }

  const has = (termId: string) => ids.value.includes(termId)

  function toggle(termId: string) {
    ids.value = has(termId) ? ids.value.filter(i => i !== termId) : [...ids.value, termId]
    save()
  }

  function clear() {
    ids.value = []
    save()
  }

  onMounted(load)
  return { ids, has, toggle, clear }
}
