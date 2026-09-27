import type { ComputedRef } from 'vue'

// A show-night screen's first read: rendered into the served page, and on a navigation inside the
// shell read once the screen has drawn, so poor signal never holds a phone on the way in (issue 1521).
export function useServedRead<T>(key: string, read: () => Promise<T>, apply: (value: T) => void): ComputedRef<boolean> {
  // Lazy holds only a client navigation: the server render still waits for the read and ships it.
  const served = useAsyncData(key, read, { lazy: true })

  // A watcher stops once a server render's setup ends, so the server applies the read itself.
  if (import.meta.server) {
    onServerPrefetch(async () => {
      const { data } = await served
      if (data.value !== undefined) apply(data.value as T)
    })
  }
  watch(served.data, (value) => {
    if (value !== undefined) apply(value as T)
  }, { immediate: true })

  // True only on a phone that navigated here and is still waiting: the screen says Syncing. The read
  // starts before the first render, and any end to it, a throw included, takes Syncing down.
  return computed(() => served.status.value === 'pending')
}
