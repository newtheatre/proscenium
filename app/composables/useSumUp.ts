import { getCurrentInstance, onMounted, ref, shallowRef } from 'vue'
import { showNightOf } from '#shared/utils/show-night'
import { isHandheldUserAgent } from '#shared/utils/sumup'
import { deviceNightCacheStore } from './useNightCache'

// The till's side of a SumUp hand-off (F-124): what it remembers while the app has the screen,
// so the basket comes back if the app says no and the answer is found if the tab was reloaded.

const PENDING_KEY = 'nnt-till-sumup-attempt'
const RETURNED_PREFIX = 'nnt-till-sumup-returned:'

// A turned-down attempt's basket, kept by id so whichever tab the operator is in can take it.
export function returnedAttemptKey(id: string): string {
  return `${RETURNED_PREFIX}${id}`
}

// The device store belongs to the night cache (K-103); this borrows it rather than opening its own.
const store = () => deviceNightCacheStore()

export interface PendingAttempt<Basket> {
  id: string
  totalPence: number
  startedAt: number
  basket: Basket
}

export interface ReturnedAttempt<Basket> extends PendingAttempt<Basket> {
  status: 'FAILED' | 'ABANDONED'
  returnedAt: number
  claimedBy: string | null
}

export type ReturnClaim<Basket> = { outcome: 'restored', attempt: ReturnedAttempt<Basket> } | { outcome: 'elsewhere' } | { outcome: 'none' }

export function useSumUp<Basket>() {
  // The SumUp app lives on a phone or a tablet; the counter laptop keys the figure (criterion 1).
  const handheld = ref(false)
  // Inside a component only: the unit test drives this with no instance, as useNightCache is.
  if (getCurrentInstance()) {
    onMounted(() => {
      handheld.value = isHandheldUserAgent(navigator.userAgent)
    })
  }

  const pending = shallowRef<PendingAttempt<Basket> | null>(null)
  // Marks the claim. Any claim, even this tab's own before a reload, means never restoring it twice.
  const tabId = crypto.randomUUID()

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
    removePending()
  }

  function readReturned(id: string): ReturnedAttempt<Basket> | null {
    try {
      const raw = store().getItem(returnedAttemptKey(id))
      return raw ? JSON.parse(raw) as ReturnedAttempt<Basket> : null
    }
    catch {
      return null
    }
  }

  // Kept, not forgotten: the Android return opens a new tab, which may not have looked yet.
  function markReturned(attempt: PendingAttempt<Basket>, status: ReturnedAttempt<Basket>['status']): void {
    if (!readReturned(attempt.id)) {
      try {
        store().setItem(returnedAttemptKey(attempt.id), JSON.stringify({ ...attempt, status, returnedAt: Date.now(), claimedBy: null }))
      }
      catch { /* the tab that holds it in memory can still restore it */ }
    }
    if (pending.value?.id === attempt.id) pending.value = null
    if (recallId() === attempt.id) removePending()
  }

  // Read and written in one task, which is as atomic as one browser's storage gets across its tabs.
  function claimReturned(id: string): ReturnClaim<Basket> {
    const held = readReturned(id)
    if (typeof held?.returnedAt !== 'number' || showNightOf(new Date(held.returnedAt)) !== showNightOf(new Date())) return { outcome: 'none' }
    if (held.claimedBy) return { outcome: 'elsewhere' }
    const claimed = { ...held, claimedBy: tabId }
    try {
      store().setItem(returnedAttemptKey(id), JSON.stringify(claimed))
    }
    catch { /* unrecorded, but this tab still restores it */ }
    return { outcome: 'restored', attempt: claimed }
  }

  // A kept basket lasts its show night (0014): tomorrow's till has no business with tonight's.
  function pruneReturned(now = Date.now()): void {
    try {
      const tonight = showNightOf(new Date(now))
      const keys: string[] = []
      for (let index = 0; index < store().length; index++) {
        const key = store().key(index)
        if (key?.startsWith(RETURNED_PREFIX)) keys.push(key)
      }
      for (const key of keys) {
        const held = JSON.parse(store().getItem(key) ?? 'null') as { returnedAt?: number } | null
        if (typeof held?.returnedAt !== 'number' || showNightOf(new Date(held.returnedAt)) !== tonight) store().removeItem(key)
      }
    }
    catch { /* pruning is housekeeping; the claim still reads its own night */ }
  }

  function recallId(): string | null {
    try {
      const raw = store().getItem(PENDING_KEY)
      return raw ? (JSON.parse(raw) as { id?: string }).id ?? null : null
    }
    catch {
      return null
    }
  }

  function removePending(): void {
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

  return { handheld, pending, recall, remember, forget, markReturned, claimReturned, pruneReturned, launch }
}
