import { describe, expect, test } from 'bun:test'
import { effectScope } from 'vue'
import { useWriteQueue } from '#composables/useWriteQueue'
import {
  dequeueAction,
  dismissRejection,
  enqueueAction,
  memoryWriteQueueStore,
  readQueueState,
  rejectAction,
} from '#shared/utils/write-queue'
import type { SubmitOutcome } from '#composables/useWriteQueue'
import type { QueuedAction, WriteQueueStore } from '#shared/utils/write-queue'

// K-104: a scan, an admit or a till sale made offline queues on the device and drains in order
// on reconnection, never silently losing or merging what it finds when it does.

describe('the queue persists what it holds (criteria 1, 4)', () => {
  test('actions enqueue in the order they were made', () => {
    const store = memoryWriteQueueStore()
    enqueueAction(store, 'admit', { ticketId: 't1' })
    enqueueAction(store, 'sale', { productId: 'p1' })
    enqueueAction(store, 'admit', { ticketId: 't2' })

    const { pending } = readQueueState(store)
    expect(pending.map(action => action.kind)).toEqual(['admit', 'sale', 'admit'])
    expect(pending.map(action => (action.payload as { ticketId?: string }).ticketId)).toEqual(['t1', undefined, 't2'])
  })

  test('every action gets its own id', () => {
    const store = memoryWriteQueueStore()
    const first = enqueueAction(store, 'admit', {})
    const second = enqueueAction(store, 'admit', {})
    expect(first.id).not.toBe(second.id)
  })

  test('dequeuing an applied action leaves the rest exactly as they were', () => {
    const store = memoryWriteQueueStore()
    const first = enqueueAction(store, 'admit', { n: 1 })
    enqueueAction(store, 'admit', { n: 2 })
    dequeueAction(store, first.id)

    expect(readQueueState(store).pending.map(action => (action.payload as { n: number }).n)).toEqual([2])
  })

  test('rejecting moves an action out of pending and into the rejected list, with a reason', () => {
    const store = memoryWriteQueueStore()
    const action = enqueueAction(store, 'admit', { ticketId: 't1' })
    rejectAction(store, action.id, 'Already admitted on another device')

    const { pending, rejected } = readQueueState(store)
    expect(pending).toEqual([])
    expect(rejected).toHaveLength(1)
    expect(rejected[0]!.id).toBe(action.id)
    expect(rejected[0]!.reason).toBe('Already admitted on another device')
  })

  test('rejecting an id not in the queue is a no-op', () => {
    const store = memoryWriteQueueStore()
    rejectAction(store, 'not-there', 'whatever')
    expect(readQueueState(store)).toEqual({ pending: [], rejected: [] })
  })

  test('dismissing a rejection clears it, and only it', () => {
    const store = memoryWriteQueueStore()
    const a = enqueueAction(store, 'admit', {})
    const b = enqueueAction(store, 'admit', {})
    rejectAction(store, a.id, 'conflict')
    rejectAction(store, b.id, 'conflict')
    dismissRejection(store, a.id)

    expect(readQueueState(store).rejected.map(action => action.id)).toEqual([b.id])
  })

  test('nothing queued reads as an empty queue, not an error', () => {
    expect(readQueueState(memoryWriteQueueStore())).toEqual({ pending: [], rejected: [] })
  })

  test('a corrupt store reads as empty rather than throwing into a screen', () => {
    const store: WriteQueueStore = { getItem: () => 'not json', setItem: () => {} }
    expect(readQueueState(store)).toEqual({ pending: [], rejected: [] })
  })

  test('a store that refuses to persist still lets the caller carry on', () => {
    const refuses: WriteQueueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    expect(() => enqueueAction(refuses, 'admit', {})).not.toThrow()
  })
})

describe('what a screen holding the queue sees (criteria 2, 3)', () => {
  async function inScope(fn: () => Promise<void> | void): Promise<void> {
    const scope = effectScope()
    try {
      await scope.run(fn)
    }
    finally {
      scope.stop()
    }
  }

  const ticketIdOf = (action: QueuedAction): string => (action.payload as { ticketId: string }).ticketId

  test('online with nothing queued, offline with a count once something is', async () => {
    await inScope(async () => {
      const store = memoryWriteQueueStore()
      const queue = useWriteQueue(async (): Promise<SubmitOutcome> => ({ ok: true }), { store })

      expect(queue.connection.value).toEqual({ status: 'online' })

      queue.enqueue('admit', { ticketId: 't1' })
      expect(queue.connection.value).toEqual({ status: 'offline', queued: 1 })
    })
  })

  test('a queued action is visible as pending the moment it is made, before any drain', async () => {
    await inScope(async () => {
      const store = memoryWriteQueueStore()
      const queue = useWriteQueue(async (): Promise<SubmitOutcome> => ({ ok: true }), { store, autoDrain: false })
      queue.enqueue('admit', { ticketId: 't1' })

      expect(queue.pending.value).toHaveLength(1)
      expect(queue.pending.value[0]!.kind).toBe('admit')
    })
  })

  test('draining submits in order and applies each in turn', async () => {
    await inScope(async () => {
      const store = memoryWriteQueueStore()
      const submitted: string[] = []
      const queue = useWriteQueue(async (action): Promise<SubmitOutcome> => {
        submitted.push(action.kind)
        return { ok: true }
      }, { store, autoDrain: false })

      queue.enqueue('admit', { ticketId: 't1' })
      queue.enqueue('sale', { productId: 'p1' })
      await queue.drain()

      expect(submitted).toEqual(['admit', 'sale'])
      expect(queue.pending.value).toEqual([])
      expect(queue.connection.value).toEqual({ status: 'online' })
    })
  })

  // The trap this criterion exists to name: a scan already admitted elsewhere reconciles as a
  // conflict for a human, never as a second silent admission.
  test('a conflicting write is refused into the rejected list, never retried, and the rest still drain', async () => {
    await inScope(async () => {
      const store = memoryWriteQueueStore()
      const queue = useWriteQueue(async (action): Promise<SubmitOutcome> => {
        if (ticketIdOf(action) === 't1') return { ok: false, retry: false, reason: 'Already admitted on another device' }
        return { ok: true }
      }, { store, autoDrain: false })

      queue.enqueue('admit', { ticketId: 't1' })
      queue.enqueue('admit', { ticketId: 't2' })
      await queue.drain()

      expect(queue.pending.value).toEqual([])
      expect(queue.rejected.value).toHaveLength(1)
      expect(queue.rejected.value[0]!.reason).toBe('Already admitted on another device')
    })
  })

  // A queued sale failing a server invariant is surfaced for re-entry, never silently dropped:
  // the same non-retried rejection as a conflict, whatever the server's reason for refusing it.
  test('a sale that fails a server invariant is surfaced, not dropped', async () => {
    await inScope(async () => {
      const store = memoryWriteQueueStore()
      const queue = useWriteQueue(async (): Promise<SubmitOutcome> =>
        ({ ok: false, retry: false, reason: 'That product is retired' }), { store, autoDrain: false })

      queue.enqueue('sale', { productId: 'p1' })
      await queue.drain()

      expect(queue.pending.value).toEqual([])
      expect(queue.rejected.value).toHaveLength(1)
      expect(queue.rejected.value[0]!.reason).toBe('That product is retired')
    })
  })

  // A transient failure (the connection dropping mid-submit) is not a conflict: it stays queued
  // and honestly offline, tried again on the next drain rather than surfaced as a decision.
  test('a transient failure leaves the action queued rather than rejecting it', async () => {
    await inScope(async () => {
      const store = memoryWriteQueueStore()
      let attempts = 0
      const queue = useWriteQueue(async (): Promise<SubmitOutcome> => {
        attempts++
        if (attempts === 1) return { ok: false, retry: true, reason: 'offline' }
        return { ok: true }
      }, { store, autoDrain: false })

      queue.enqueue('admit', { ticketId: 't1' })
      await queue.drain()
      expect(queue.pending.value).toHaveLength(1)
      expect(queue.rejected.value).toEqual([])
      expect(queue.connection.value).toEqual({ status: 'offline', queued: 1 })

      await queue.drain()
      expect(queue.pending.value).toEqual([])
      expect(attempts).toBe(2)
    })
  })

  // A transient failure on the first item must not let a later item apply out of order ahead
  // of it: submitting in order (criterion 1) means the drain stops rather than skipping past it.
  test('a transient failure on the first item halts the drain rather than reordering', async () => {
    await inScope(async () => {
      const store = memoryWriteQueueStore()
      const attempted: string[] = []
      const queue = useWriteQueue(async (action): Promise<SubmitOutcome> => {
        attempted.push(ticketIdOf(action))
        if (ticketIdOf(action) === 't1') return { ok: false, retry: true, reason: 'offline' }
        return { ok: true }
      }, { store, autoDrain: false })

      queue.enqueue('admit', { ticketId: 't1' })
      queue.enqueue('admit', { ticketId: 't2' })
      await queue.drain()

      expect(attempted).toEqual(['t1'])
      expect(queue.pending.value.map(ticketIdOf)).toEqual(['t1', 't2'])
    })
  })

  // Criterion 4, named directly: capture offline, reconnect, one conflict among them, and the
  // queue drains to zero with the conflict reported rather than silently absorbed.
  test('offline capture then reconnection drains to zero with the conflict reported', async () => {
    await inScope(async () => {
      const store = memoryWriteQueueStore()
      const queue = useWriteQueue(async (action): Promise<SubmitOutcome> => {
        if (ticketIdOf(action) === 'dupe') return { ok: false, retry: false, reason: 'Already admitted on another device' }
        return { ok: true }
      }, { store, autoDrain: false })

      queue.enqueue('admit', { ticketId: 't1' })
      queue.enqueue('admit', { ticketId: 'dupe' })
      queue.enqueue('admit', { ticketId: 't3' })
      expect(queue.connection.value).toEqual({ status: 'offline', queued: 3 })

      await queue.drain()

      expect(queue.pending.value).toEqual([])
      expect(queue.connection.value).toEqual({ status: 'online' })
      expect(queue.rejected.value.map(ticketIdOf)).toEqual(['dupe'])
    })
  })

  test('dismissing a rejection removes it from what the screen shows', async () => {
    await inScope(async () => {
      const store = memoryWriteQueueStore()
      const queue = useWriteQueue(async (): Promise<SubmitOutcome> =>
        ({ ok: false, retry: false, reason: 'conflict' }), { store, autoDrain: false })

      queue.enqueue('admit', { ticketId: 't1' })
      await queue.drain()
      const id = queue.rejected.value[0]!.id
      queue.dismiss(id)

      expect(queue.rejected.value).toEqual([])
    })
  })

  // Criterion 1: leaving and returning to a screen re-reads the same device queue rather than
  // starting a second one, so navigating within the app never loses what was already made.
  test('a second screen opening the same queue sees what the first one left pending', async () => {
    await inScope(async () => {
      const store = memoryWriteQueueStore()
      const door = useWriteQueue(async (): Promise<SubmitOutcome> => ({ ok: true }), { store, autoDrain: false })
      door.enqueue('admit', { ticketId: 't1' })

      const reopened = useWriteQueue(async (): Promise<SubmitOutcome> => ({ ok: true }), { store, autoDrain: false })
      expect(reopened.pending.value).toHaveLength(1)
      expect(reopened.pending.value[0]!.kind).toBe('admit')
    })
  })
})
