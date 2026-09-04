import { getCurrentInstance, onMounted, ref, shallowRef, toValue, watch } from 'vue'
import {
  NIGHT_CACHE_PREFIX,
  memoryNightCacheStore,
  pruneNightCache,
  readNightCache,
  refreshNightCache,
} from '#shared/utils/night-cache'
import type { MaybeRefOrGetter, Ref, ShallowRef } from 'vue'
import type { NightCacheStore } from '#shared/utils/night-cache'

// A show-night screen's data, held on the device so venue Wi-Fi dropping never blanks it (K-103).
// Everything imported rather than auto-imported, because the tests run this outside Nuxt.

let fallback: NightCacheStore | null = null

// Memory when the device has no storage or refuses it, so a screen still holds its night for as
// long as the tab lives. Reading is the probe: private browsing throws on access, not on open.
export function deviceNightCacheStore(): NightCacheStore {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem(NIGHT_CACHE_PREFIX)
      return localStorage
    }
  }
  catch {
    // Refused, so memory it is.
  }
  fallback ??= memoryNightCacheStore()
  return fallback
}

export interface NightCacheOptions {
  store?: NightCacheStore
  // Off for a screen that loads on an action rather than on open.
  immediate?: boolean
}

export interface NightCache<T> {
  data: ShallowRef<T | null>
  cachedAt: Ref<number | null>
  pending: Ref<boolean>
  error: Ref<Error | null>
  live: Ref<boolean>
  recall: () => void
  refresh: () => Promise<void>
}

export function useNightCache<T>(key: MaybeRefOrGetter<string>, loader: () => Promise<T>, options: NightCacheOptions = {}): NightCache<T> {
  const store = options.store ?? deviceNightCacheStore()
  const data = shallowRef<T | null>(null)
  const cachedAt = ref<number | null>(null)
  const pending = ref(false)
  const error = ref<Error | null>(null)
  const live = ref(false)

  // What the device holds, with no round trip. A screen shows this before it asks for anything,
  // which is what makes an offline open a full render rather than a spinner.
  function recall(): void {
    const entry = readNightCache<T>(store, toValue(key))
    data.value = entry?.data ?? null
    cachedAt.value = entry?.cachedAt ?? null
    live.value = false
  }

  async function refresh(): Promise<void> {
    const asked = toValue(key)
    pending.value = true
    try {
      const entry = await refreshNightCache<T>(store, asked, loader)
      // The screen can move venue under a slow load, and that answer is no longer its night.
      if (asked !== toValue(key)) return
      data.value = entry.data
      cachedAt.value = entry.cachedAt
      error.value = null
      live.value = true
      pruneNightCache(store, entry.night)
    }
    catch (thrown) {
      if (asked !== toValue(key)) return
      // What the screen is showing stays put: a failed load is a stale screen, never a blank one.
      error.value = thrown instanceof Error ? thrown : new Error(String(thrown))
      live.value = false
    }
    finally {
      if (asked === toValue(key)) pending.value = false
    }
  }

  function open(): void {
    recall()
    if (options.immediate !== false) void refresh()
  }

  // After mount, never during setup: the server holds no device store, so reading one into the
  // first render would be a hydration mismatch on every night screen.
  if (getCurrentInstance()) onMounted(open)
  watch(() => toValue(key), open)

  return { data, cachedAt, pending, error, live, recall, refresh }
}

// What one screen caches for another, so the emergency card is there from the start of the shift
// rather than from the first visit to it (K-103 criterion 3, E-113 criterion 2).
export async function primeNightCache<T>(key: string, load: () => T | Promise<T>, store: NightCacheStore = deviceNightCacheStore()): Promise<boolean> {
  try {
    await refreshNightCache(store, key, async () => await load())
    return true
  }
  catch {
    // Best effort by design: priming another screen must never break the screen doing it.
    return false
  }
}
