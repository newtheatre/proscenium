// Shift reminders (part 3, "Reminders"; FH-15): at most two, at reminders.first and .second before
// the call time. `reminded` records how many have gone, so a re-run sends nothing twice, and someone
// who signs up late gets one reminder, not both at once.
import { all, nowMs, useSetting, type UnitView } from '#kit'
import { notify } from '#modules/core'
import { formatter, partFormatters } from './words'

const SECOND = 1000 // not-policy: settings are whole seconds
const BATCH = 200 // not-policy: one unit's worth of reminders; the next run takes the rest

export async function sendReminders(unit: UnitView): Promise<number> {
  const first = await useSetting('front-of-house.reminders.first') as number
  const second = await useSetting('front-of-house.reminders.second') as number
  const longest = Math.max(first, second)
  if (!longest) return 0
  const at = nowMs()
  const rows = await all<{ id: string, account_id: string, reminded: number, call_at: number, duty: string, title: string | null, show: string | null }>(
    `SELECT a.id, a.account_id, a.reminded, s.call_at, d.name AS duty, s.title,
        (SELECT p.title FROM core_performances f JOIN core_productions p ON p.id = f.production_id WHERE f.id = s.performance_id) AS show
       FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id JOIN front_of_house_duties d ON d.id = s.duty_id
      WHERE a.state IN ('confirmed', 'release_requested') AND s.state = 'published' AND a.reminded < 2
        AND s.call_at > ? AND s.call_at - ? <= ?
      ORDER BY s.call_at LIMIT ?`,
    at, longest * SECOND, at, BATCH)
  // The level each is due: 2 once inside the second, else 1 once inside the first. A reminder that is off counts as sent.
  const due = rows.map((r) => {
    const left = r.call_at - at
    const level = second && left <= second * SECOND ? 2 : first && left <= first * SECOND ? (second ? 1 : 2) : 0
    return { ...r, level }
  }).filter(r => r.level > r.reminded)
  if (!due.length) return 0
  const format = await formatter()
  const { date } = await partFormatters()
  await notify(unit, 'front-of-house.shift-reminder', {
    to: due.map(r => ({ accountId: r.account_id, variables: { duty: r.duty, show: r.show ?? r.title ?? '', when: format(r.call_at), date: date(r.call_at) }, dedupeKey: `reminder:${r.id}:${r.level}` })),
  })
  for (const level of [1, 2]) {
    const ids = due.filter(r => r.level === level).map(r => r.id)
    if (ids.length) unit.add({ sql: 'UPDATE front_of_house_assignments SET reminded = ?, updated_at = ? WHERE id IN (SELECT value FROM json_each(?)) AND reminded < ?', params: [level, at, JSON.stringify(ids), level] })
  }
  return due.length
}
