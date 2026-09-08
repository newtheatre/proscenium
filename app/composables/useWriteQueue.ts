import { computed, ref, shallowRef } from 'vue'
import {
  WRITE_QUEUE_KEY,
  dequeueAction,
  dismissRejection,
  enqueueAction,
  memoryWriteQueueStore,
  readQueueState,
  rejectAction,
} from '#shared/utils/write-queue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import type { QueuedAction, RejectedAction, WriteQueueStore } from '#shared/utils/write-queue'

// The device-side outbox K-104 asks for: a scan, an admit or a till sale queues while offline
// and drains in order. Everything imported rather than auto-imported: the tests run outside Nuxt.

let fallback: WriteQueueStore | null = null

// Memory when the device has no storage or refuses it, the same probe `deviceNightCacheStore`
// uses: reading is what private browsing throws on, not opening.
export function deviceWriteQueueStore(): WriteQueueStore {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem(WRITE_QUEUE_KEY)
      return localStorage
    }
  }
  catch {
    // Refused, so memory it is.
  }
  fallback ??= memoryWriteQueueStore()
  return fallback
}

export type SubmitOutcome
  = | { ok: true }
  // A genuine refusal: a conflict or a failed server invariant, surfaced for a human rather
  // than retried.
    | { ok: false, retry: false, reason: string }
  // The connection dropped mid-submit: stays queued, tried again on the next drain.
    | { ok: false, retry: true, reason: string }

export interface WriteQueueOptions {
  store?: WriteQueueStore
  // Off for a caller that wants to choose exactly when a drain happens.
  autoDrain?: boolean
}

export type ConnectionState = { status: 'online' } | { status: 'offline', queued: number }

export interface WriteQueue<T = unknown> {
  pending: ShallowRef<QueuedAction<T>[]>
  rejected: ShallowRef<RejectedAction<T>[]>
  // Never a network probe: a non-empty queue is the honest offline state, whatever the browser
  // claims, because it is unsynced either way (criterion 2).
  connection: ComputedRef<ConnectionState>
  enqueue: (kind: string, payload: T) => void
  drain: () => Promise<void>
  dismiss: (id: string) => void
}

export function useWriteQueue<T = unknown>(
  submit: (action: QueuedAction<T>) => Promise<SubmitOutcome>,
  options: WriteQueueOptions = {},
): WriteQueue<T> {
  const store = options.store ?? deviceWriteQueueStore()
  const initial = readQueueState(store)
  const pending = shallowRef(initial.pending as QueuedAction<T>[])
  const rejected = shallowRef(initial.rejected as RejectedAction<T>[])
  const draining: Ref<boolean> = ref(false)

  const connection = computed<ConnectionState>(() =>
    pending.value.length === 0 ? { status: 'online' } : { status: 'offline', queued: pending.value.length })

  function enqueue(kind: string, payload: T): void {
    const action = enqueueAction(store, kind, payload)
    pending.value = [...pending.value, action]
    if (options.autoDrain !== false) void drain()
  }

  // One attempt at a time, oldest first: a later action must never apply ahead of one still
  // stuck, so a transient failure stops the drain rather than being stepped over (criterion 1).
  async function drain(): Promise<void> {
    if (draining.value) return
    draining.value = true
    try {
      for (;;) {
        const next = pending.value[0]
        if (!next) return
        const outcome = await submit(next)

        if (outcome.ok) {
          dequeueAction(store, next.id)
          pending.value = pending.value.filter(action => action.id !== next.id)
          continue
        }
        if (outcome.retry) return

        rejectAction(store, next.id, outcome.reason)
        pending.value = pending.value.filter(action => action.id !== next.id)
        rejected.value = [...rejected.value, { ...next, reason: outcome.reason }]
      }
    }
    finally {
      draining.value = false
    }
  }

  function dismiss(id: string): void {
    dismissRejection(store, id)
    rejected.value = rejected.value.filter(action => action.id !== id)
  }

  return { pending, rejected, connection, enqueue, drain, dismiss }
}
