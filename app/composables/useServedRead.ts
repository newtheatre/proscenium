import type { ComputedRef } from 'vue'

export interface ServedReadOptions {
  // Read by the server render alone: a phone navigating here has its own copy and refreshes it.
  serverOnly?: boolean
}

// A show-night screen's first read: rendered into the served page, and on a navigation inside the
// shell read once the screen has drawn, so poor signal never holds a phone on the way in (issue 1521).
export function useServedRead<T>(key: string, read: () => Promise<T>, apply: (value: T) => void, options: ServedReadOptions = {}): ComputedRef<boolean> {
  // Lazy holds only a client navigation: the server render still waits for the read and ships it.
  const served = useAsyncData(key, () => (options.serverOnly && import.meta.client ? Promise.resolve(null) : read()), { lazy: true })

  // A watcher stops once a server render's setup ends, so the server applies the read itself. Null is
  // no answer at all, which a server-only read gives a phone.
  if (import.meta.server) {
    onServerPrefetch(async () => {
      const { data } = await served
      if (data.value != null) apply(data.value as T)
    })
  }
  watch(served.data, (value) => {
    if (value != null) apply(value as T)
  }, { immediate: true })

  // True only on a phone that navigated here and is still waiting: the screen says Syncing. The read
  // starts before the first render, and any end to it, a throw included, takes Syncing down.
  return computed(() => served.status.value === 'pending')
}
