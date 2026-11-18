// My account's Upcoming card (AC-3): every module's coming things for the person, soonest first.
// A source that fails leaves its items out, never the card.
import { usePoint, type Actor } from '#kit'
import type { UpcomingItem, UpcomingSource } from '../points/upcoming'

export const UPCOMING_SHOWN = 5 // not-policy: a short list on a card

export async function upcomingFor(actor: Actor, limit = UPCOMING_SHOWN): Promise<(UpcomingItem & { key: string })[]> {
  if (actor.kind !== 'person' || !actor.accountId) return []
  const items: (UpcomingItem & { key: string })[] = []
  for (const source of await usePoint<UpcomingSource>('core.upcoming')) {
    try {
      for (const item of await source.value.items(actor, limit)) items.push({ ...item, key: `${source.id}:${item.id}` })
    }
    catch {
      // Tidiness, not a fault: the overview still opens.
    }
  }
  return items.sort((a, b) => a.at - b.at).slice(0, limit)
}
