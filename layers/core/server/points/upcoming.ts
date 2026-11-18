// Contract for core.upcoming: what the person asking has coming, for My account's Upcoming card.
// Each item is one thing on one occasion (two tickets for one performance are one item). The words
// are a translation key with values, so the card says them in the person's language; `title` is a
// record's own name (a production's title), shown as it is. A source with nothing returns [].
import type { Actor } from '#kit'

export interface UpcomingItem {
  /** Unique among the source's items. */
  id: string
  /** When it starts, in UTC milliseconds; the card lists the soonest first. */
  at: number
  icon: string
  /** The thing's own name, such as a production's title, or null when it has none. */
  title: string | null
  /** What it is, by translation key: "2 tickets", "Usher". */
  label: string
  params?: Record<string, string | number>
  /** Where it is seen, when it has a page the person can open. */
  to?: string
}

export interface UpcomingSource {
  /** At most `limit` items, the soonest first, from now on. */
  items: (actor: Actor, limit: number) => Promise<UpcomingItem[]>
}
