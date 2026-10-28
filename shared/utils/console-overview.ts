import { saysEligibility, saysQualified } from './rota-readiness'
import { plural } from './text'
import { NAV_COUNTS } from './site-nav'
import type { Permission } from './roles'
import type { RoleEligibility } from './rota-readiness'
import type { ShiftRole } from './rota'
import type { NavCount } from './site-nav'

// The console overview (issue 1358): what waits for the viewer, what set-up is unfinished and what
// is on tonight, each offered only to somebody who could act on it.

// The permission that decides each queue. A live department lead answers training requests for
// their own departments without the Theatre Manager's grant (G-110).
const DECIDES: Record<NavCount, Permission> = {
  'membership-claims': 'members.write',
  'access-profiles': 'access.verify',
  'room-requests': 'rooms.write',
  'training-requests': 'training.read',
  'pass-requests': 'ticketing.write',
  'rota-claims': 'rota.write',
}

export function queuesFor(permissions: ReadonlySet<Permission>, leadsDepartment: boolean): NavCount[] {
  return NAV_COUNTS.filter(count => permissions.has(DECIDES[count]) || (count === 'training-requests' && leadsDepartment))
}

// Each fact is left out for a reader who could not act on it, so it is never read for them.
export interface SetUpFacts {
  eligibility?: readonly RoleEligibility[]
  qualified?: Partial<Record<ShiftRole, number>>
  anythingOnHand?: boolean
  anyStocktake?: boolean
  allergensUnknown?: number
  anySeverityRoutes?: boolean
  venuesWithoutCard?: readonly string[]
}

export type SetUpLine
  = | { kind: 'ELIGIBILITY', eligibility: RoleEligibility }
    | { kind: 'NOBODY_QUALIFIES', eligibility: RoleEligibility }
    | { kind: 'NOTHING_ON_HAND' }
    | { kind: 'NO_STOCKTAKE' }
    | { kind: 'ALLERGENS_UNKNOWN', items: number }
    | { kind: 'NO_SAFETY_ROUTING' }
    | { kind: 'NO_EMERGENCY_CARD', venues: readonly string[] }

export function setUpLines(facts: SetUpFacts): SetUpLine[] {
  return [
    ...(facts.eligibility ?? []).filter(line => line.standing !== 'SET').map(eligibility => ({ kind: 'ELIGIBILITY' as const, eligibility })),
    // A named module nobody holds still leaves the role unstaffable, the duty manager most of all (0210).
    ...(facts.qualified === undefined ? [] : (facts.eligibility ?? []))
      .filter(line => line.standing === 'SET' && facts.qualified?.[line.role] === 0)
      .map(eligibility => ({ kind: 'NOBODY_QUALIFIES' as const, eligibility })),
    ...(facts.anythingOnHand === false ? [{ kind: 'NOTHING_ON_HAND' as const }] : []),
    ...(facts.anyStocktake === false ? [{ kind: 'NO_STOCKTAKE' as const }] : []),
    ...(facts.allergensUnknown ? [{ kind: 'ALLERGENS_UNKNOWN' as const, items: facts.allergensUnknown }] : []),
    ...(facts.anySeverityRoutes === false ? [{ kind: 'NO_SAFETY_ROUTING' as const }] : []),
    ...(facts.venuesWithoutCard?.length ? [{ kind: 'NO_EMERGENCY_CARD' as const, venues: facts.venuesWithoutCard }] : []),
  ]
}

export function saysSetUp(line: SetUpLine): string {
  switch (line.kind) {
    case 'ELIGIBILITY': return saysEligibility(line.eligibility)
    case 'NOBODY_QUALIFIES': return saysQualified(line.eligibility, 0) ?? ''
    case 'NOTHING_ON_HAND': return 'Nothing is on hand at the bar: record a delivery or an opening count.'
    case 'NO_STOCKTAKE': return 'No stocktake has been applied yet, so on-hand is what deliveries and sales say, not a count.'
    case 'ALLERGENS_UNKNOWN': return `${plural(line.items, 'stocked item')} ${line.items === 1 ? 'has' : 'have'} no allergen answer.`
    case 'NO_SAFETY_ROUTING': return 'No incident severity routes to follow-up, so a serious incident reaches nobody.'
    case 'NO_EMERGENCY_CARD': return `Running tonight with no emergency card to read to 999: ${line.venues.join(', ')}.`
    default: return line satisfies never
  }
}

// The screen that finishes each line: the readiness card for a gating module (issue 1318).
export function setUpHref(line: SetUpLine): string {
  switch (line.kind) {
    case 'ELIGIBILITY': return '/rota/manage/templates'
    case 'NOBODY_QUALIFIES': return '/rota/manage/templates'
    case 'NOTHING_ON_HAND': return '/bar/stock'
    case 'NO_STOCKTAKE': return '/bar/stock/stocktakes'
    case 'ALLERGENS_UNKNOWN': return '/bar/stock/allergens'
    case 'NO_SAFETY_ROUTING': return '/rota/manage/safety'
    case 'NO_EMERGENCY_CARD': return '/rota/manage/emergency'
    default: return line satisfies never
  }
}

// A fresh install's set-up in the order its screens lean on each other, shown to the IT Manager
// until every step has been started once (0221).
export const FIRST_RUN_STEPS = ['VENUE', 'SEASON', 'TICKET_TYPE', 'SHOW', 'ROLES', 'ROTA_TEMPLATE', 'BAR_PRODUCT'] as const
export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number]

export interface FirstRunLine { step: FirstRunStep, done: boolean }

// Null once every step is done, so a working install never carries the card.
export function firstRunLines(done: Readonly<Record<FirstRunStep, boolean>>): FirstRunLine[] | null {
  if (FIRST_RUN_STEPS.every(step => done[step])) return null
  return FIRST_RUN_STEPS.map(step => ({ step, done: done[step] }))
}

const FIRST_RUN: Record<FirstRunStep, { says: string, to: string }> = {
  VENUE: { says: 'Add the venues the theatre performs in', to: '/box-office/venues' },
  SEASON: { says: 'Open a season for the programme', to: '/box-office/seasons' },
  TICKET_TYPE: { says: 'Set the ticket types and their prices', to: '/box-office/ticket-types' },
  SHOW: { says: 'Add the first show and its performances', to: '/box-office/shows' },
  ROLES: { says: 'Grant the rest of the committee their roles', to: '/people/roles' },
  ROTA_TEMPLATE: { says: 'Give a venue the shifts its nights need', to: '/rota/manage/templates' },
  BAR_PRODUCT: { says: 'Add the bar\'s products', to: '/bar/products' },
}

export const saysFirstRun = (step: FirstRunStep): string => FIRST_RUN[step].says
export const firstRunHref = (step: FirstRunStep): string => FIRST_RUN[step].to

export interface TonightLine {
  performanceId: string
  showTitle: string
  venueName: string
  startsAt: number
}

export function tonightLines(performances: readonly { id: string, showTitle: string, venueName: string, startsAt: number, status: string }[]): TonightLine[] {
  return performances
    .filter(performance => performance.status !== 'CANCELLED')
    .map(({ id, showTitle, venueName, startsAt }) => ({ performanceId: id, showTitle, venueName, startsAt }))
}

// The nights from tonight that the rota's week reads, and what one of them still needs (0253).
export const ROTA_WEEK_NIGHTS = 7

export interface RotaWeekLine {
  night: string
  // Open or declined shifts and bar opening slots, which nobody is down to work.
  open: number
  // Performances with a duty manager shift and none of them confirmed.
  withoutDutyManager: number
}

// Only a night that still needs somebody is a line; a week with none is said as one sentence.
export function rotaWeekLines(nights: readonly RotaWeekLine[]): RotaWeekLine[] {
  return nights.filter(line => line.open > 0 || line.withoutDutyManager > 0)
}

export function saysRotaWeekLine(line: RotaWeekLine): string {
  const parts = [
    ...(line.open > 0 ? [`${plural(line.open, 'place')} to fill`] : []),
    ...(line.withoutDutyManager > 0 ? [line.withoutDutyManager === 1 ? 'no confirmed duty manager' : `${line.withoutDutyManager} performances with no confirmed duty manager`] : []),
  ]
  return parts.join(', ')
}

// Tonight is null for a reader who holds no night permission, and a list, maybe empty, otherwise;
// the first run is null for anybody but the IT Manager, and for them once it is finished.
export interface ConsoleOverview {
  setUp: SetUpLine[]
  tonight: TonightLine[] | null
  firstRun: FirstRunLine[] | null
  // Null for a reader who cannot read the rota; otherwise only the nights still needing somebody.
  rotaWeek: RotaWeekLine[] | null
}
