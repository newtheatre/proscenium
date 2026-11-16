// Counts (UI-04, UI-16): a registered number a menu entry or a card shows. A count that fails or
// is not registered reads as zero, so a broken count hides its badge and never breaks a screen.
import { usePoint } from '#kit'
import type { Actor } from '#kit'
import type { Count } from '../points/count'

export async function countOf(name: string, actor: Actor): Promise<number> {
  const found = (await usePoint<Count>('core.count')).find(c => c.id === name)
  if (!found) return 0
  try {
    const value = await found.value.value(actor)
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
