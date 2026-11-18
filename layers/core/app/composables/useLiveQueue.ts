// Live mode's queue of waiting writes (docs/kit/interface.md, "Live mode"): what a live screen does
// while the device is offline is kept on the device and sent, oldest first, when the connection
// returns. A screen gives the queue a name and a `send` that takes the waiting items and resolves
// once the server has them; until it resolves they stay, so a write is never lost to a dropped
// connection. A batch whose answer was lost is sent again unchanged, so `send` must be safe to
// repeat (give each item an id the server can recognise). The status strip shows how many writes
// are waiting on every queue.
//
// The device copy is browser storage: it survives a reload, but not clearing the site's data or a
// private window, where the queue works for the life of the page.
import { useOnline } from '@vueuse/core'

interface Kept<T> { items: T[], sending: T[] | null }

const PREFIX = 'proscenium:live-queue:' // not-policy: a storage key

function read<T>(key: string): Kept<T> {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw) {
      const kept = JSON.parse(raw) as Kept<T>
      if (Array.isArray(kept.items)) return { items: kept.items, sending: Array.isArray(kept.sending) ? kept.sending : null }
    }
  }
  catch {
    // Storage blocked or unreadable: the queue lives in memory only.
  }
  return { items: [], sending: null }
}

function write<T>(key: string, kept: Kept<T>) {
  try {
    if (kept.items.length || kept.sending?.length) localStorage.setItem(PREFIX + key, JSON.stringify(kept))
    else localStorage.removeItem(PREFIX + key)
  }
  catch {
    // As above: kept in memory for the life of the page.
  }
}

export function useLiveQueue<T, R = unknown>(key: string, send: (items: T[]) => Promise<R>, options: { onSent?: (items: T[], answer: R) => void } = {}) {
  const online = useOnline()
  const waiting = useState<Record<string, number>>('core:live-queue', () => ({}))
  const kept = ref(import.meta.client ? read<T>(key) : { items: [], sending: null }) as Ref<Kept<T>>
  const sending = ref(false)
  const failed = ref(false)

  const count = computed(() => kept.value.items.length + (kept.value.sending?.length ?? 0))
  watch(count, (n) => {
    waiting.value = { ...waiting.value, [key]: n }
  }, { immediate: true })
  onScopeDispose(() => {
    const { [key]: _, ...rest } = waiting.value
    waiting.value = rest
  })

  function save() {
    write(key, kept.value)
  }

  /** Keeps an item to send; sends at once when online. */
  function add(item: T) {
    kept.value = { ...kept.value, items: [...kept.value.items, item] }
    save()
    void flush()
  }

  /** Sends what is waiting, if the device is online and nothing is on its way already. */
  async function flush() {
    if (!import.meta.client || sending.value || !online.value) return
    // A batch already on its way when the page closed, or whose answer was lost, goes again as it was.
    if (!kept.value.sending) {
      if (!kept.value.items.length) return
      kept.value = { items: [], sending: kept.value.items }
      save()
    }
    const batch = kept.value.sending!
    sending.value = true
    try {
      const answer = await send(batch)
      kept.value = { ...kept.value, sending: null }
      save()
      failed.value = false
      options.onSent?.(batch, answer)
    }
    catch {
      failed.value = true
    }
    finally {
      sending.value = false
    }
    if (!failed.value && kept.value.items.length) await flush()
  }

  watch(online, (now) => {
    if (now) void flush()
  })
  onMounted(() => {
    kept.value = read<T>(key)
    void flush()
  })

  /** Every item not yet confirmed by the server, waiting or on its way. */
  const pending = computed(() => [...(kept.value.sending ?? []), ...kept.value.items])
  return { add, flush, pending, count, sending, failed }
}

/** How many writes are waiting on every live queue on this page, for the status strip. */
export function useLiveWaiting() {
  const waiting = useState<Record<string, number>>('core:live-queue', () => ({}))
  return computed(() => Object.values(waiting.value).reduce((n, v) => n + v, 0))
}
