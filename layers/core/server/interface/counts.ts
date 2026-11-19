// Counts (UI-04, UI-16): a registered number a menu entry or a card shows. A count that fails, is
// not registered or does not answer in time reads as zero, so it never breaks or holds up a screen.
import { usePoint } from '#kit'
import type { Actor } from '#kit'
import type { Count } from '../points/count'

const DEADLINE = 3_000 // not-policy: a count is a badge; a slower one reads as zero rather than hold up a screen

/** The promise's value, or `fallback` once `ms` have passed without one. */
export function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<T>((resolve) => { timer = setTimeout(resolve, ms, fallback) })
  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}

export async function countOf(name: string, actor: Actor, deadline = DEADLINE): Promise<number> {
  const found = (await usePoint<Count>('core.count')).find(c => c.id === name)
  if (!found) return 0
  try {
    const value = await within(Promise.resolve(found.value.value(actor)), deadline, 0)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  }
  catch {
    return 0
  }
}

/** Whether something with a count shows: with hideEmpty it needs at least one. */
export async function shows(item: { count?: string, hideEmpty?: boolean }, actor: Actor): Promise<{ show: boolean, value?: number }> {
  if (!item.count) return { show: true }
  const value = await countOf(item.count, actor)
  return { show: !item.hideEmpty || value > 0, value }
}
