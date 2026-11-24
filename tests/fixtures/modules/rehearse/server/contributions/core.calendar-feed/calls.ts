// The fixture's rehearsal calls for the calendar feed (C-70), set by each test per account; `failing`
// makes the second contribution throw, to show the rest of the feed is still served (CF6).
import type { CalendarFeed, CalendarFeedEvent } from '#modules/core'

export const feedCalls = new Map<string, CalendarFeedEvent[]>()
export const broken = { failing: false }

export default {
  async events(accountId, from, to) {
    return (feedCalls.get(accountId) ?? []).filter(c => c.startsAt < to && c.endsAt > from)
  },
} satisfies CalendarFeed
