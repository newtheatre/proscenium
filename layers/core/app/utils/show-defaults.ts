// What the show's defaults section (ShowDefaults.vue) takes and gives (run presets, Matt 2026-11-17).
export interface ShowDefaultValues {
  runningMinutes: number
  doorsBeforeMinutes: number
  intervalCount: number
  intervalMinutes: number
  capacity: number | null
  externalBookingUrl: string | null
}
export interface ShowOverrides {
  runningMinutes: number | null
  doorsBeforeMinutes: number | null
  intervalCount: number | null
  intervalMinutes: number | null
  capacity: number | null
  label: string
  bookedElsewhere: boolean
  externalBookingUrl: string
}

/** Overrides that change nothing: every field at the show's defaults. */
export function noOverrides(): ShowOverrides {
  return { runningMinutes: null, doorsBeforeMinutes: null, intervalCount: null, intervalMinutes: null, capacity: null, label: '', bookedElsewhere: false, externalBookingUrl: '' }
}

/** One line of the start-times editor: a start time and the ISO weekdays it runs on, as strings. */
export interface SlotRow { time: string, days: string[] }
/** A run's or preset's start times, as the server keeps them. */
export interface RunSlot { days: number[], times: string[] }

/** Server slots as editor lines, one line for each start time. */
export function slotRows(slots: RunSlot[]): SlotRow[] {
  return slots.flatMap(s => s.times.map(time => ({ time, days: s.days.map(String) })))
}
/** Editor lines as server slots, leaving out a line with no time or no days. */
export function rowSlots(rows: SlotRow[]): RunSlot[] {
  return rows.filter(r => r.time && r.days.length).map(r => ({ days: r.days.map(Number), times: [r.time] }))
}
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Start times in words: "Tue to Sat 19:30 · Sat 14:30". */
export function slotsInWords(slots: RunSlot[]): string {
  return slots.map((s) => {
    const days = [...s.days].sort((a, b) => a - b)
    const runOn = days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1]! + 1)
    return `${runOn ? `${DAY_NAMES[days[0]!]} to ${DAY_NAMES[days.at(-1)!]}` : days.map(d => DAY_NAMES[d]).join(', ')} ${s.times.join(', ')}`
  }).join(' · ')
}
