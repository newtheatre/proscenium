// The ambient context of one request, job or task, carried by AsyncLocalStorage (nodejs_compat).
// Kept apart from context.ts so the clock can read it without an import cycle.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { KitContext } from './context'

export const storage = new AsyncLocalStorage<KitContext>()

export function currentContext(): KitContext | undefined {
  return storage.getStore()
}
