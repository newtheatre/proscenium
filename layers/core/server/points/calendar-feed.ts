// Contract for core.calendar-feed (C-70): the things one person is on (a shift, a call, a meeting), as
// calendar events for their private feed. Titles and locations are public-safe: never a person's name,
// a reason, a note or anything classed personal (CF4).
export interface CalendarFeedEvent {
  /** The contributor's own stable record id; the feed writes the UID as <contributor>.<key>@<site marker>. */
  key: string
  startsAt: number
  endsAt: number
  allDay?: boolean
  title: string
  location?: string
  status: 'confirmed' | 'tentative' | 'cancelled'
  /** Shown free rather than busy, such as a drop-in's opening hours (DI5). */
  transparent?: boolean
  /** When the record last changed, for the calendar app to order versions. */
  updatedAt?: number
}

export interface CalendarFeed {
  /** The account's events overlapping [from, to), cancelled ones included while in the window. */
  events: (accountId: string, from: number, to: number) => Promise<CalendarFeedEvent[]>
}
