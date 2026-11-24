// A space's Confirmed room bookings, for core and the occupancy view. Every one yields: a performance
// scheduled over it is warned about, never refused (part 4, core.space-busy). Labels follow rule K2.
import { all, can, useSetting } from '#kit'
import type { SpaceBusy, SpaceBusyItem } from '#modules/core'

export default {
  async busy({ spaceIds, from, to }, actor) {
    if (!spaceIds.length) return []
    const rows = await all<{ id: string, bookable_id: string, space_id: string, starts_at: number, ends_at: number, booked_for: string, title: string, purpose: string }>(
      `SELECT b.id, b.bookable_id, k.space_id, b.starts_at, b.ends_at, b.booked_for, b.title, p.name AS purpose
         FROM spaces_bookings b JOIN spaces_bookables k ON k.id = b.bookable_id JOIN spaces_purposes p ON p.id = b.purpose_id
        WHERE k.space_id IN (SELECT value FROM json_each(?)) AND b.state = 'confirmed' AND b.starts_at < ? AND b.ends_at > ?
        ORDER BY b.starts_at, b.id`, JSON.stringify(spaceIds.slice(0, 30)), to, from) // not-policy: the point's limit of spaces
    const details = actor ? await useSetting('spaces.calendar.show-details') as 'full' | 'purpose' | 'busy' : 'busy'
    const staff = new Map<string, boolean>()
    const out: SpaceBusyItem[] = []
    for (const r of rows) {
      let label: string | null = null
      if (actor) {
        if (!staff.has(r.bookable_id)) staff.set(r.bookable_id, (await can(actor, 'spaces.booking.view', ['spaces.bookable', r.bookable_id])).allowed)
        const full = r.booked_for === actor.accountId || staff.get(r.bookable_id) || details === 'full'
        label = full ? r.title : details === 'purpose' ? r.purpose : null
      }
      out.push({ spaceId: r.space_id, kind: 'room-booking', from: r.starts_at, to: r.ends_at, yields: true, record: { type: 'spaces.booking', id: r.id }, label })
    }
    return out
  },
} satisfies SpaceBusy
