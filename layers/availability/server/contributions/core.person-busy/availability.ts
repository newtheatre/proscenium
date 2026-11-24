// Stated busy time to core.person-busy (part 4): busy only, never maybe or unknown, never a reason.
// Not firm, since it is the person's word rather than a booking; Find a time drops its own rows.
import { theatreTimeZone } from '#kit'
import { localDateOf } from '#kit/clock'
import type { PersonBusy, PersonBusyItem } from '#modules/core'
import { blocksBetween } from '../../levels'
import { rowsOf } from '../../reading'

export default {
  async busy({ accountIds, from, to }) {
    const zone = await theatreTimeZone()
    const rows = await rowsOf(accountIds, localDateOf(from, zone), localDateOf(to - 1, zone))
    const out: PersonBusyItem[] = []
    for (const accountId of accountIds) {
      const r = rows.get(accountId)!
      for (const b of blocksBetween({ from, to, zone, lines: r.lines, exceptions: r.exceptions, unmarked: 'unknown', showReason: () => false })) {
        if (b.level === 'busy') out.push({ accountId, kind: 'unavailable', from: b.from, to: b.to, firm: false, labelKey: 'availability.unavailable', record: null })
      }
    }
    return out
  },
} satisfies PersonBusy
