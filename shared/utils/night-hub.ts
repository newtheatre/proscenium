import { plural } from './text'
import { saysPrice } from './ticket-types'
import { saysClock, saysDay } from './when'

// What the show-night header and the hub's tiles read (E-112). Pure: the numbers and the wording
// are decided here so one test holds them, and the screens only place them.

export interface HubHouse {
  sold: number
  admitted: number
  capacity: number | null
  remaining: number | null
}

// The line under the show title: "Thu 5 Nov · 19:30 · Main Hall". Never a year: the header is
// always tonight's house, whichever committee year the clock has reached (0009, copy-style §9).
export function nightHeaderLine(startsAt: number, venueName: string): string {
  return `${saysDay(startsAt, { year: false })} · ${saysClock(startsAt)} · ${venueName}`
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
  soldPercent: number | null
}

// One duty manager reads the hub, the glance, the door and the till in one interval, so the three
// house numbers carry one word each wherever they are placed (issue 1150 item 11).
export const HUB_KPI_LABELS = { sold: 'sold', admitted: 'in', seatsLeft: 'seats left', toCome: 'to come' } as const

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
    soldPercent: percent,
  }
}

// The bar under the numbers is sold over capacity, so it is the sold share it names: admitted is
// the next number along, and reading one for the other overstates the room (issue 1150 item 10).
export function housePercentLine(soldPercent: number | null): string {
  if (soldPercent === null) return 'No cap on this house'
  return `${soldPercent}% of the house sold`
}

// Read back before the one tap that gives money away (D-117, F-110). A ticket comp prices nothing
// here, so it says what it is rather than an amount of nought.
export function compApprovalLine(requestedByName: string, totalPence: number | null): string {
  const what = totalPence === null ? 'A ticket' : `${saysPrice(totalPence)} at the bar`
  return `${what} for ${requestedByName}.`
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

/** "2h 10 · 1 interval", the answer the door is asked most often after the price. */
export function runningTimeLine(durationMinutes: number | null, intervalCount: number, intervalMinutes: number | null): string {
  const counted = plural(intervalCount, 'interval')
  const intervals = intervalCount === 0
    ? 'straight through'
    : intervalMinutes ? `${counted} of ${intervalMinutes} minutes` : counted
  if (durationMinutes === null) return `Running time not yet stated · ${intervals}`
  return `${Math.floor(durationMinutes / 60)}h ${String(durationMinutes % 60).padStart(2, '0')} · ${intervals}`
}

/** Two groups of three, so the backstage code can be read out over a headset. */
export function groupedBoardCode(code: string): string {
  const digits = code.replace(/\s+/g, '')
  if (digits.length !== 6) return code
  return `${digits.slice(0, 3)} ${digits.slice(3)}`
}
