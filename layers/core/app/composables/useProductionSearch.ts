// A picker's search over the productions, after a pause in typing: what is found, minus any the picker already has.
import { watchDebounced } from '@vueuse/core'

export interface ProductionChoice { id: string, label: string }

export function useProductionSearch(options: { query?: () => Record<string, unknown>, keep: (id: string) => boolean }) {
  const { $api } = useNuxtApp()
  const search = ref('')
  const found = ref<ProductionChoice[]>([])
  const searching = ref(false)
  watchDebounced(search, async (q) => {
    if (q.trim().length < 2) {
      found.value = []
      return
    }
    searching.value = true
    try {
      const answer = await $api<{ rows: { id: string, title: string }[] }>('/api/core/productions', { query: { q, size: 10, ...options.query?.() } }) // not-policy: a picker's length
      found.value = answer.rows.filter(r => options.keep(r.id)).map(r => ({ id: r.id, label: r.title }))
    }
    catch {
      found.value = []
    }
    finally {
      searching.value = false
    }
  }, { debounce: 250 }) // not-policy: typing pause before a search
  return { search, found, searching }
}
