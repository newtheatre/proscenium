import type { Ref } from 'vue'
import type { SettledRead } from '~/utils/refusal'

export type NightLogRead<T> = SettledRead<{ items: T[] }>

export interface NightLog<T> {
  items: Ref<T[]>
  failure: Ref<string | null>
  syncedAt: Ref<number | null>
  busy: Ref<boolean>
  read: () => Promise<NightLogRead<T>>
  apply: (answered: NightLogRead<T>) => void
  load: () => Promise<void>
}

// Tonight's incident log and Challenge 25 register read alike: one page of entries, and a failed read
// keeps the last good list on screen for NightStale to date (E-112 criterion 3).
export function useNightLog<T>(path: '/api/tonight/incidents' | '/api/tonight/age-checks'): NightLog<T> {
  const request = useRequestFetch()
  const items = ref([]) as Ref<T[]>
  const failure = ref<string | null>(null)
  const syncedAt = ref<number | null>(null)
  const busy = ref(false)

  function read(): Promise<NightLogRead<T>> {
    return settleRead(() => request<{ items: T[] }>(path, { query: { pageSize: 100 } }))
  }

  function apply(answered: NightLogRead<T>): void {
    if (answered.kind === 'FAILED') {
      failure.value = answered.failure
      return
    }
    failure.value = null
    items.value = answered.value.items
    syncedAt.value = answered.at
  }

  async function load(): Promise<void> {
    busy.value = true
    try {
      apply(await read())
    }
    finally {
      busy.value = false
    }
  }

  return { items, failure, syncedAt, busy, read, apply, load }
}
