import { saysLatecomerPolicy } from './programme'
import { performanceEnd } from './rota-times'
import { plural } from './text'
import { saysPrice } from './ticket-types'
import { saysClock, saysDay } from './when'
import type { NightRole } from './night-authority'
import type { PerformanceTimes } from './rota-times'

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

// "1 interval of 20 minutes", or "straight through" for none.
export function saysIntervals(intervalCount: number, intervalMinutes: number | null): string {
  if (intervalCount === 0) return 'straight through'
  const counted = plural(intervalCount, 'interval')
  return intervalMinutes ? `${counted} of ${intervalMinutes} minutes` : counted
}

/** "2h 10 · 1 interval", the answer the door is asked most often after the price. */
export function runningTimeLine(durationMinutes: number | null, intervalCount: number, intervalMinutes: number | null): string {
  const intervals = saysIntervals(intervalCount, intervalMinutes)
  if (durationMinutes === null) return `Running time not yet stated · ${intervals}`
  return `${Math.floor(durationMinutes / 60)}h ${String(durationMinutes % 60).padStart(2, '0')} · ${intervals}`
}

// The door's numbers in one line, in the house's own words (issue 1150 item 16, issue 1307).
export function doorStripNumbers(house: HubHouse): string {
  const left = house.remaining === null ? 'no cap' : `${house.remaining} ${HUB_KPI_LABELS.seatsLeft}`
  return `${house.admitted} ${HUB_KPI_LABELS.admitted} · ${house.sold} ${HUB_KPI_LABELS.sold} · ${left}`
}

// The line under the door's numbers: what to tell somebody arriving late, and when the break is
// (issue 1307). The glance says each at more length.
export function doorStripLine(latecomerPolicy: string | null, intervalCount: number, intervalMinutes: number | null): string {
  return `${saysLatecomerPolicy(latecomerPolicy)} · ${saysIntervals(intervalCount, intervalMinutes)}`
}

// The door reads the agreed access wording and the duty manager runs the night; the bar serves
// drinks and needs neither (D-127 criterion 3, issue 1307).
export function seesAccessTonight(role: NightRole): boolean {
  return role === 'DOOR' || role === 'DUTY_MANAGER'
}

// The hub's destinations and the roles whose authority opens each (E-112 criterion 1, issue 1304).
// Emergency answers anyone, and a tile nobody's authority opens is not drawn at all.
export type HubTileId = 'door' | 'till' | 'glance' | 'checklist' | 'report' | 'age-checks' | 'backstage' | 'contacts' | 'message' | 'emergency'

const HUB_TILE_ROLES: Record<HubTileId, readonly NightRole[] | 'ANYONE'> = {
  'door': ['DOOR'],
  'till': ['BAR'],
  'glance': ['DUTY_MANAGER', 'DOOR', 'BAR'],
  'checklist': ['DUTY_MANAGER'],
  'report': ['DUTY_MANAGER'],
  'age-checks': ['DUTY_MANAGER', 'DOOR', 'BAR'],
  'backstage': ['DUTY_MANAGER'],
  'contacts': ['DUTY_MANAGER', 'DOOR', 'BAR'],
  'message': ['DUTY_MANAGER'],
  'emergency': 'ANYONE',
}

const HUB_TILE_ORDER = Object.keys(HUB_TILE_ROLES) as HubTileId[]

// The job a role is there to do, first and in gold; the duty manager's runs the night, and after
// the curtain it is the night report, which ends it (issue 1315).
const OWN_JOB: [NightRole, HubTileId][] = [['DUTY_MANAGER', 'glance'], ['DOOR', 'door'], ['BAR', 'till']]

// `null` is roles not yet known, or a phone offline: every tile then, since each screen guards
// itself (E-111 criterion 5) and a missing tile is worse than a refused one.
export function hubTiles(roles: readonly NightRole[] | null, curtainDown = false): { id: HubTileId, gold: boolean }[] {
  if (roles === null) return HUB_TILE_ORDER.map(id => ({ id, gold: false }))
  const opens = (id: HubTileId): boolean => {
    const needs = HUB_TILE_ROLES[id]
    return needs === 'ANYONE' || needs.some(role => roles.includes(role))
  }
  const job = OWN_JOB.find(([role]) => roles.includes(role))?.[1] ?? null
  const own = job === 'glance' && curtainDown ? 'report' : job
  const rest = HUB_TILE_ORDER.filter(id => id !== own && opens(id)).map(id => ({ id, gold: false }))
  return own ? [{ id: own, gold: true }, ...rest] : rest
}

// Its running time and intervals past curtain up, or curtain up itself where none is recorded,
// 0078's own fallback. Nothing that ends the night is pinned before it (issue 1315).
export function curtainIsDown(performance: PerformanceTimes, at: number): boolean {
  return at >= performanceEnd(performance)
}

// Who a refused volunteer turns to: tonight's duty manager, by first name where the rota has one.
export function whoCanHelpTonight(team: readonly { role: string, filled: boolean, name: string | null }[] | null): string {
  const first = firstNameOf(team?.find(member => member.role === 'DUTY_MANAGER' && member.filled)?.name)
  return first ? `Ask ${first}, tonight's duty manager.` : 'Ask tonight\'s duty manager.'
}

/** Two groups of three, so the backstage code can be read out over a headset. */
export function groupedBoardCode(code: string): string {
  const digits = code.replace(/\s+/g, '')
  if (digits.length !== 6) return code
  return `${digits.slice(0, 3)} ${digits.slice(3)}`
}
