import { formatLondon } from './london'

// What the show-night header and the hub's tiles read (E-112). Pure: the numbers and the wording
// are decided here so one test holds them, and the screens only place them.

export interface HubHouse {
  sold: number
  admitted: number
  capacity: number | null
  remaining: number | null
}

/** The line under the show title: "Thu 5 Nov · 19:30 · Main Hall". */
export function nightHeaderLine(startsAt: number, venueName: string): string {
  const at = new Date(startsAt * 1000)
  const day = formatLondon(at, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day} · ${formatLondon(at, { timeStyle: 'short' })} · ${venueName}`
}

/** First name only: the badge is read at arm's length, and a surname never helps it. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first || null
}

// An officer opening a screen without a shift is not on shift, and the badge says so rather than
// borrowing the wording of a rota slot (0044).
export function onShiftLabel(via: 'SHIFT' | 'OFFICER' | null, name: string | null | undefined): string | null {
  if (via === 'OFFICER') return 'Officer'
  if (via !== 'SHIFT') return null
  const first = firstNameOf(name)
  return first ? `On shift · ${first}` : 'On shift'
}

export interface HubKpis {
  reserved: number
  capacity: number | null
  collected: number
  headroom: number | null
  toCome: number
  collectedPercent: number | null
}

// "Walk-up headroom" is the seats nobody has reserved, which is what the door is really asking.
// "To come" is the reserved seats still to arrive, never a negative one if admissions overrun.
export function hubKpis(house: HubHouse): HubKpis {
  const percent = house.capacity && house.capacity > 0 ? Math.round((house.sold / house.capacity) * 100) : null
  return {
    reserved: house.sold,
    capacity: house.capacity,
    collected: house.admitted,
    headroom: house.remaining,
    toCome: Math.max(0, house.sold - house.admitted),
    collectedPercent: percent,
  }
}

// Whether the door can admit pass holders without thinking. Three states, because a volunteer at
// 19:20 needs an answer and not a ratio; the numbers themselves sit beside it either way.
export function passPressureAdvice(covering: number, headroom: number | null): string {
  if (covering === 0) return 'No passes cover tonight.'
  if (headroom === null) return 'Uncapped house: admit pass holders freely.'
  if (covering * 2 <= headroom) return 'Comfortable: admit pass holders freely.'
  if (covering <= headroom) return 'Tight: admit pass holders and watch the walk-up queue.'
  return 'More passes than seats left: admit in order of arrival and send walk-ups to the bar.'
}

/** "2h 10 · one interval", the answer the door is asked most often after the price. */
export function runningTimeLine(durationMinutes: number | null, intervalCount: number, intervalMinutes: number | null): string {
  const intervals = intervalCount === 0
    ? 'straight through'
    : intervalCount === 1 ? `one interval${intervalMinutes ? ` of ${intervalMinutes} minutes` : ''}` : `${intervalCount} intervals`
  if (durationMinutes === null) return `Running time not yet stated · ${intervals}`
  return `${Math.floor(durationMinutes / 60)}h ${String(durationMinutes % 60).padStart(2, '0')} · ${intervals}`
}

/** Two groups of three, so tonight's board code can be read out over a headset. */
export function groupedBoardCode(code: string): string {
  const digits = code.replace(/\s+/g, '')
  if (digits.length !== 6) return code
  return `${digits.slice(0, 3)} ${digits.slice(3)}`
}
