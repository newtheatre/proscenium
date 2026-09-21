import { formatLondon } from './london'
import { plural } from './text'

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
  sold: number
  capacity: number | null
  admitted: number
  seatsLeft: number | null
  toCome: number
  admittedPercent: number | null
}

// One duty manager reads the hub, the glance, the door and the till in one interval, so the three
// house numbers carry one word each wherever they are placed (issue 1150 item 11).
export const HUB_KPI_LABELS = { sold: 'sold', admitted: 'in', seatsLeft: 'seats left' } as const

/** An uncapped house in words a volunteer says out loud, never a symbol at arm's length. */
export function saysSeatsLeft(seatsLeft: number | null): string {
  return seatsLeft === null ? 'No cap' : String(seatsLeft)
}

// "Seats left" is capacity less what is sold, which is what the door is really asking. "To come"
// is the sold seats still to arrive, never a negative one if admissions overrun.
export function hubKpis(house: HubHouse): HubKpis {
  const percent = house.capacity && house.capacity > 0 ? Math.round((house.sold / house.capacity) * 100) : null
  return {
    sold: house.sold,
    capacity: house.capacity,
    admitted: house.admitted,
    seatsLeft: house.remaining,
    toCome: Math.max(0, house.sold - house.admitted),
    admittedPercent: percent,
  }
}

export interface ChecklistPhaseEntry { phase: 'PRE' | 'POST', done: boolean }

// What the hub's checklist tile says instead of repeating the screen's name (issue 1150 item 3).
// House open chooses which phase is asked about first; a phase already clear is never reported.
export function checklistHint(entries: readonly ChecklistPhaseEntry[], houseOpen: boolean): string {
  if (entries.length === 0) return 'Pre-show and post-show'
  const order: ChecklistPhaseEntry['phase'][] = houseOpen ? ['POST', 'PRE'] : ['PRE', 'POST']
  for (const phase of order) {
    const left = entries.filter(entry => entry.phase === phase && !entry.done).length
    if (left > 0) return `${plural(left, phase === 'PRE' ? 'pre-show item' : 'post-show item')} left`
  }
  return 'All ticked'
}

// The generic fallback is not a reason: reading it after a colon tells a duty manager nothing the
// first half did not (issue 1150 item 11).
export function staleBannerLine(reason: string | null): string {
  return reason ? `Showing what was last loaded: ${reason}` : 'Showing what was last loaded'
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
