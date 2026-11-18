// Live mode's device copy of data (docs/kit/interface.md, "Live mode"): a live screen that must keep
// working offline reads through this. Online, it fetches the address and keeps what came back on the
// device; offline, or when the fetch fails, it answers with the copy kept last time, with when it
// was made. It fetches again when the connection returns, and every `every` milliseconds if given. Copies older than `keepFor` are dropped
// when any live screen opens, so names and codes do not linger on a shared device.
import { useOnline } from '@vueuse/core'

interface Copy<T> { at: number, data: T }

const PREFIX = 'proscenium:live-data:' // not-policy: a storage key
const DAY = 86_400_000 // not-policy: milliseconds in a day

function forgetOld(keepFor: number) {
  try {
    const now = Date.now()
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const name = localStorage.key(i)
      if (!name?.startsWith(PREFIX)) continue
      const copy = JSON.parse(localStorage.getItem(name) ?? 'null') as Copy<unknown> | null
      if (!copy || now - copy.at > keepFor) localStorage.removeItem(name)
    }
  }
  catch {
    // Storage blocked: there is nothing kept to forget.
  }
}

export function useLiveData<T>(key: string, url: MaybeRefOrGetter<string>, options: { keepFor?: number, every?: number } = {}) {
  const { $api } = useNuxtApp()
  const online = useOnline()
  const data = ref<T | null>(null) as Ref<T | null>
  /** When the copy shown was fetched; null before there is one. */
  const at = ref<number | null>(null)
  const loading = ref(false)

  function keep(copy: Copy<T>) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(copy))
    }
    catch {
      // Storage full or blocked: the copy lives in memory for the life of the page.
    }
  }

  function kept(): Copy<T> | null {
    try {
      return JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null') as Copy<T> | null
    }
    catch {
      return null
    }
  }

  async function refresh() {
    if (!import.meta.client) return
    if (!online.value) return
    loading.value = true
    try {
      const fresh = await $api<T>(toValue(url))
      const copy = { at: Date.now(), data: fresh }
      data.value = fresh
      at.value = copy.at
      keep(copy)
    }
    catch {
      // Unreachable or refused: the copy kept last time stands.
    }
    finally {
      loading.value = false
    }
  }

  let timer: ReturnType<typeof setInterval> | undefined
  onBeforeUnmount(() => clearInterval(timer))
  onMounted(() => {
    if (options.every) timer = setInterval(() => void refresh(), options.every)
    forgetOld(options.keepFor ?? DAY)
    const copy = kept()
    if (copy) {
      data.value = copy.data
      at.value = copy.at
    }
    void refresh()
  })
  watch(online, (now) => {
    if (now) void refresh()
  })

  /** Changes the copy on the device, such as marking someone in while offline, until the next fetch. */
  function update(change: (current: T) => T) {
    if (data.value === null) return
    data.value = change(data.value)
    keep({ at: at.value ?? Date.now(), data: data.value })
  }

  return { data, at, loading, refresh, update }
}
