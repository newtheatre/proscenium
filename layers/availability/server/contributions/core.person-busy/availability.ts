// To core.person-busy (part 4): stated busy time, never maybe or unknown or a reason, not firm; and
// arranged meetings, firm, for each invitee not saying not going (M5). Find a time drops its own rows.
import { theatreTimeZone } from '#kit'
import { localDateOf } from '#kit/clock'
import type { PersonBusy, PersonBusyItem } from '#modules/core'
import { blocksBetween } from '../../levels'
import { meetingBusy } from '../../meetings'
import { rowsOf } from '../../reading'

export default {
  async busy({ accountIds, from, to }) {
    const zone = await theatreTimeZone()
    const rows = await rowsOf(accountIds, localDateOf(from, zone), localDateOf(to - 1, zone))
    const out: PersonBusyItem[] = []
    for (const accountId of accountIds) {
      const r = rows.get(accountId)!
      for (const b of blocksBetween({ from, to, zone, rows: r, unmarked: 'unknown', showReason: () => false })) {
        if (b.level === 'busy') out.push({ accountId, kind: 'unavailable', from: b.from, to: b.to, firm: false, labelKey: 'availability.unavailable', record: null })
      }
    }
    for (const m of await meetingBusy(accountIds, from, to))
      out.push({ accountId: m.accountId, kind: 'meeting', from: Math.max(m.from, from), to: Math.min(m.to, to), firm: true, labelKey: 'availability.meeting', record: { type: 'availability.meeting', id: m.meetingId } })
    return out
  },
} satisfies PersonBusy
