import { saysEligibility } from './rota-readiness'
import { plural } from './text'
import { NAV_COUNTS } from './site-nav'
import type { Permission } from './roles'
import type { RoleEligibility } from './rota-readiness'
import type { NavCount } from './site-nav'

// The console overview (issue 1358): what waits for the viewer, what set-up is unfinished and what
// is on tonight, each offered only to somebody who could act on it.

// The permission that decides each queue. A live department lead answers training requests for
// their own departments without the training officer's grant (G-110).
const DECIDES: Record<NavCount, Permission> = {
  'membership-claims': 'members.write',
  'access-profiles': 'access.verify',
  'room-requests': 'rooms.write',
  'training-requests': 'training.read',
  'pass-requests': 'ticketing.write',
}

export function queuesFor(permissions: ReadonlySet<Permission>, leadsDepartment: boolean): NavCount[] {
  return NAV_COUNTS.filter(count => permissions.has(DECIDES[count]) || (count === 'training-requests' && leadsDepartment))
}

// Each fact is left out for a reader who could not act on it, so it is never read for them.
export interface SetUpFacts {
  eligibility?: readonly RoleEligibility[]
  anythingOnHand?: boolean
  anyStocktake?: boolean
  allergensUnknown?: number
}

export type SetUpLine
  = | { kind: 'ELIGIBILITY', eligibility: RoleEligibility }
    | { kind: 'NOTHING_ON_HAND' }
    | { kind: 'NO_STOCKTAKE' }
    | { kind: 'ALLERGENS_UNKNOWN', products: number }

export function setUpLines(facts: SetUpFacts): SetUpLine[] {
  return [
    ...(facts.eligibility ?? []).filter(line => line.standing !== 'SET').map(eligibility => ({ kind: 'ELIGIBILITY' as const, eligibility })),
    ...(facts.anythingOnHand === false ? [{ kind: 'NOTHING_ON_HAND' as const }] : []),
    ...(facts.anyStocktake === false ? [{ kind: 'NO_STOCKTAKE' as const }] : []),
    ...(facts.allergensUnknown ? [{ kind: 'ALLERGENS_UNKNOWN' as const, products: facts.allergensUnknown }] : []),
  ]
}

export function saysSetUp(line: SetUpLine): string {
  switch (line.kind) {
    case 'ELIGIBILITY': return saysEligibility(line.eligibility)
    case 'NOTHING_ON_HAND': return 'Nothing is on hand at the bar: record a delivery or an opening count.'
    case 'NO_STOCKTAKE': return 'No stocktake has been applied yet, so on-hand is what deliveries and sales say, not a count.'
    case 'ALLERGENS_UNKNOWN': return `${plural(line.products, 'product')} ${line.products === 1 ? 'has' : 'have'} no allergen information recorded.`
    default: return line satisfies never
  }
}

// The screen that finishes each line: the readiness card for a gating module (issue 1318).
export function setUpHref(line: SetUpLine): string {
  switch (line.kind) {
    case 'ELIGIBILITY': return '/rota/manage/templates'
    case 'NOTHING_ON_HAND': return '/bar/stock'
    case 'NO_STOCKTAKE': return '/bar/stock/stocktakes'
    case 'ALLERGENS_UNKNOWN': return '/bar/products'
    default: return line satisfies never
  }
}

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

// Tonight is null for a reader who holds no night permission, and a list, maybe empty, otherwise.
export interface ConsoleOverview {
  setUp: SetUpLine[]
  tonight: TonightLine[] | null
}
