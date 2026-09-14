import { isHandheldUserAgent } from '#shared/utils/sumup'
import { deviceNightCacheStore } from './useNightCache'

// The till's side of a SumUp hand-off (F-124): what it remembers while the app has the screen,
// so the basket comes back if the app says no and the answer is found if the tab was reloaded.

const PENDING_KEY = 'nnt-till-sumup-attempt'

// The device store belongs to the night cache (K-103); this borrows it rather than opening its own.
const store = () => deviceNightCacheStore()

export interface PendingAttempt<Basket> {
  id: string
  totalPence: number
  startedAt: number
  basket: Basket
}

export function useSumUp<Basket>() {
  // The SumUp app lives on a phone or a tablet; the counter laptop keys the figure (criterion 1).
  const handheld = ref(false)
  onMounted(() => {
    handheld.value = isHandheldUserAgent(navigator.userAgent)
  })

  const pending = shallowRef<PendingAttempt<Basket> | null>(null)

  function recall(): PendingAttempt<Basket> | null {
    try {
      const raw = store().getItem(PENDING_KEY)
      pending.value = raw ? JSON.parse(raw) as PendingAttempt<Basket> : null
    }
    catch {
      pending.value = null
    }
    return pending.value
  }

  function remember(attempt: PendingAttempt<Basket>): void {
    pending.value = attempt
    try {
      store().setItem(PENDING_KEY, JSON.stringify(attempt))
    }
    catch { /* a browser that will not keep it still gets the poll while the tab lives */ }
  }

  function forget(): void {
    pending.value = null
    try {
      store().removeItem(PENDING_KEY)
    }
    catch { /* nothing to forget */ }
  }

  // A plain navigation, not window.open: the custom scheme is what hands over to the app, and a
  // popup blocker has no say in it.
  function launch(url: string): void {
    window.location.href = url
  }

  return { handheld, pending, recall, remember, forget, launch }
}
