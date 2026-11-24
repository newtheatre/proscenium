// Daily: one message to each approver listing the requests they may decide that have waited longer
// than spaces.requests.remind-after (rule A5). Keyed by the day, so a second run sends nothing.
import { all, defineTask, localDate, nowMs, useSetting } from '#kit'
import { holdersOf, notify } from '#modules/core'

const SECOND = 1000 // not-policy: settings are whole seconds

export default defineTask(async (unit) => {
  const at = nowMs()
  const after = (await useSetting('spaces.requests.remind-after') as number) * SECOND
  const old = await all<{ id: string, booked_for: string }>('SELECT id, booked_for FROM spaces_bookings WHERE state = \'requested\' AND starts_at > ? AND created_at <= ? ORDER BY starts_at', at, at - after)
  if (!old.length) return
  const waiting = new Map<string, number>()
  for (const r of old) {
    for (const approver of await holdersOf('spaces.booking.decide', ['spaces.booking', r.id])) {
      if (approver !== r.booked_for) waiting.set(approver, (waiting.get(approver) ?? 0) + 1)
    }
  }
  const day = await localDate(at)
  for (const [approver, count] of waiting) {
    await notify(unit, 'spaces.requests-waiting', { to: approver, variables: { count: String(count) }, dedupeKey: `waiting:${approver}:${day}` })
  }
})
