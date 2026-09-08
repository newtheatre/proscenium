// A device-side outbox for writes made offline, so a connection hole costs nothing and hides
// nothing (K-104). One queue per device: a scan, an admit and a sale wait their turn together.

// In the key, so a build that changes the envelope reads none of the old queue and starts fresh
// rather than misreading it.
export const WRITE_QUEUE_VERSION = 1
export const WRITE_QUEUE_KEY = `nnt.queue.${WRITE_QUEUE_VERSION}`

export interface QueuedAction<T = unknown> {
  id: string
  kind: string
  payload: T
  queuedAt: number
}

// What a rejected action carries for a human to act on. Never retried automatically: retrying a
// conflict is the silent merge this story exists to refuse (criterion 3).
export interface RejectedAction<T = unknown> extends QueuedAction<T> {
  reason: string
}

export interface QueueState {
  pending: QueuedAction[]
  rejected: RejectedAction[]
}

// The subset of the browser's Storage a queue uses, so localStorage satisfies it and a test or a
// device that refuses storage can supply something else.
export interface WriteQueueStore {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function isQueuedAction(value: unknown): value is QueuedAction {
  if (typeof value !== 'object' || value === null) return false
  const action = value as Record<string, unknown>
  return typeof action.id === 'string' && typeof action.kind === 'string' && typeof action.queuedAt === 'number' && 'payload' in action
}

function isRejectedAction(value: unknown): value is RejectedAction {
  return isQueuedAction(value) && typeof (value as { reason?: unknown }).reason === 'string'
}

function emptyState(): QueueState {
  return { pending: [], rejected: [] }
}

// Anything unreadable reads as empty rather than throwing into a screen: a corrupt queue costs
// what is in it, never the screen that would otherwise show it.
export function readQueueState(store: WriteQueueStore): QueueState {
  try {
    const raw = store.getItem(WRITE_QUEUE_KEY)
    if (raw === null) return emptyState()
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return emptyState()
    const state = parsed as Record<string, unknown>
    const pending = Array.isArray(state.pending) ? state.pending.filter(isQueuedAction) : []
    const rejected = Array.isArray(state.rejected) ? state.rejected.filter(isRejectedAction) : []
    return { pending, rejected }
  }
  catch {
    return emptyState()
  }
}

// Best effort by design, the same as a refused cache write: a device that cannot persist the
// queue still has to let the screen work, and the in-memory copy is what carries it that far.
function writeQueueState(store: WriteQueueStore, state: QueueState): void {
  try {
    store.setItem(WRITE_QUEUE_KEY, JSON.stringify(state))
  }
  catch {
    // Refused. The caller's own in-memory state is still current.
  }
}

// Appended, never reordered: submitting in order (criterion 1) is the array's own order.
export function enqueueAction<T>(store: WriteQueueStore, kind: string, payload: T): QueuedAction<T> {
  const state = readQueueState(store)
  const action: QueuedAction<T> = { id: crypto.randomUUID(), kind, payload, queuedAt: Date.now() }
  writeQueueState(store, { ...state, pending: [...state.pending, action] })
  return action
}

// Applied: it leaves the queue outright. A losing racer never reaches this; see reject below.
export function dequeueAction(store: WriteQueueStore, id: string): void {
  const state = readQueueState(store)
  writeQueueState(store, { ...state, pending: state.pending.filter(action => action.id !== id) })
}

// Rejected: out of the pending list, which is what lets it drain to zero, but kept and reasoned
// rather than dropped, for the human decision criterion 3 asks for.
export function rejectAction(store: WriteQueueStore, id: string, reason: string): void {
  const state = readQueueState(store)
  const found = state.pending.find(action => action.id === id)
  if (!found) return
  writeQueueState(store, {
    pending: state.pending.filter(action => action.id !== id),
    rejected: [...state.rejected, { ...found, reason }],
  })
}

// A human has seen it and decided: correct it elsewhere and re-enter it, or let it go. Either
// way it is done with the queue, which never revisits a decision it did not make itself.
export function dismissRejection(store: WriteQueueStore, id: string): void {
  const state = readQueueState(store)
  writeQueueState(store, { ...state, rejected: state.rejected.filter(action => action.id !== id) })
}

export function memoryWriteQueueStore(): WriteQueueStore {
  const held = new Map<string, string>()
  return {
    getItem: key => held.get(key) ?? null,
    setItem: (key, value) => {
      held.set(key, value)
    },
  }
}
