import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { FIRST_RUN_STEPS, ROTA_WEEK_NIGHTS, firstRunLines, queuesFor, rotaWeekLines, setUpLines, tonightLines } from '#shared/utils/console-overview'
import { OPEN_STATUSES } from '#shared/utils/external-requests'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { accessProfilesList } from '#shared/utils/access-profiles-list'
import { membershipClaimsList } from '#shared/utils/membership-claims-list'
import { OPERATIONAL_PERMISSIONS } from '#shared/utils/roles'
import { currentShowNight, showNightBounds, showNightOpensAt } from '#shared/utils/show-night'
import { daysAfter } from '#shared/utils/membership'
import { accessProfilesClause } from './access-profiles'
import { allergensUnansweredCount, onHandColumn } from './bar'
import { STOCK_COUNTED } from './bar-linkage'
import { claimsClause } from './membership-claims'
import { performancesOnNight } from './performances'
import { qualifiedCounts, roleEligibilities } from './rota-readiness'
import { waitingClaimsCount } from './rota'
import { unfiledTonightQuery } from './venue-emergency'
import { demandScope } from './training-demand'
import type { ConsoleOverview, FirstRunStep, RotaWeekLine } from '#shared/utils/console-overview'
import type { Permission } from '#shared/utils/roles'
import type { NavCount } from '#shared/utils/site-nav'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// The console overview's reads (issue 1358). A count is the waiting set its own screen opens on,
// built from that screen's clause where it has one, so the sidebar, overview and list agree.

const open = sql.join(OPEN_STATUSES.map(status => sql`${status}`), sql`, `)

const COUNTS: Record<NavCount, (leadOf: string | undefined) => SQL> = {
  'membership-claims': () => sql`(SELECT count(*) FROM membership_claims
    JOIN users ON users.id = membership_claims.user_id
    WHERE ${claimsClause(filterQuerySchema(membershipClaimsList).parse({})).where})`,
  'access-profiles': () => sql`(SELECT count(*) FROM access_profiles
    JOIN users ON users.id = access_profiles.user_id
    WHERE ${accessProfilesClause(filterQuerySchema(accessProfilesList).parse({})).where})`,
  // Our own rooms' requests and the unlisted ones still open: the two halves the queue lists.
  'room-requests': () => sql`((SELECT count(*) FROM room_bookings WHERE status = 'PENDING_APPROVAL')
    + (SELECT count(*) FROM external_requests WHERE status IN (${open})))`,
  'training-requests': leadOf => sql`(SELECT count(*) FROM module_requests r
    JOIN modules m ON m.id = r.module_id
    WHERE r.status = 'OPEN' AND ${demandScope(leadOf)})`,
  // The desk lists requests only for a pass on sale, so one on any other cannot be fulfilled there.
  'pass-requests': () => sql`(SELECT count(*) FROM pass_requests r
    JOIN pass_types t ON t.id = r.pass_type_id
    WHERE r.status = 'PENDING' AND t.status = 'ON_SALE')`,
  // The board's own Waiting for confirmation count, so the badge and the filter agree (0253).
  'rota-claims': () => waitingClaimsCount(showNightOpensAt(currentShowNight())),
}

// One row, one column per queue asked for, named by its key. Never called with none.
export function waitingCountsQuery(queues: readonly NavCount[], leadOf: string | undefined): SQL {
  return sql`SELECT ${sql.join(queues.map(count => sql`${COUNTS[count](leadOf)} AS ${sql.identifier(count)}`), sql`, `)}`
}

// `leadOf` is the demand board's own scope (scopeToLeadOf): undefined for the Theatre Manager.
export async function waitingCounts(permissions: ReadonlySet<Permission>, leadOf: string | undefined, leadsDepartment: boolean): Promise<Partial<Record<NavCount, number>>> {
  const queues = queuesFor(permissions, leadsDepartment)
  if (queues.length === 0) return {}
  const [row] = await db.all<Record<NavCount, number>>(waitingCountsQuery(queues, leadOf))
  return Object.fromEntries(queues.map(count => [count, Number(row?.[count] ?? 0)]))
}

export function barSetUpQuery(): SQL {
  return sql`SELECT
    EXISTS (SELECT 1 FROM bar_items i WHERE i.status = 'ACTIVE' AND ${onHandColumn('i')} > 0) AS anythingOnHand,
    ${STOCK_COUNTED} AS anyStocktake,
    ${allergensUnansweredCount()} AS allergensUnknown`
}

interface BarSetUp { anythingOnHand: number, anyStocktake: number, allergensUnknown: number }

// Every severity ships routing nowhere (E-116 criterion 1), so until one is opted in nobody is told.
export function safetyRoutingQuery(): SQL {
  return sql`SELECT EXISTS (SELECT 1 FROM incident_severity_config WHERE requires_follow_up = 1) AS anySeverityRoutes`
}

// One row, each step a constant EXISTS with no status or expiry filter, so a lapsed committee year
// or an archived catalogue never reopens it; only deleting a step's last row does (0221).
export function firstRunQuery(): SQL {
  const started: Record<FirstRunStep, SQL> = {
    VENUE: sql`EXISTS (SELECT 1 FROM venues)`,
    SEASON: sql`EXISTS (SELECT 1 FROM seasons)`,
    TICKET_TYPE: sql`EXISTS (SELECT 1 FROM ticket_types)`,
    SHOW: sql`EXISTS (SELECT 1 FROM shows)`,
    ROLES: sql`EXISTS (SELECT 1 FROM role_grants WHERE role <> 'ADMIN')`,
    ROTA_TEMPLATE: sql`EXISTS (SELECT 1 FROM shift_templates)`,
    BAR_PRODUCT: sql`EXISTS (SELECT 1 FROM bar_products)`,
  }
  return sql`SELECT ${sql.join(FIRST_RUN_STEPS.map(step => sql`${started[step]} AS ${sql.identifier(step)}`), sql`, `)}`
}

// One row per night from tonight, a fixed seven, so its parameters never grow with the rota (0006, 0253).
export function rotaWeekQuery(tonight: string): SQL {
  const nights = Array.from({ length: ROTA_WEEK_NIGHTS }, (_, offset) => daysAfter(tonight, offset))
  return sql.join(nights.map((night) => {
    const { from, to } = showNightBounds(night)
    const start = Math.floor(from.getTime() / 1000)
    const end = Math.floor(to.getTime() / 1000)
    return sql`SELECT ${night} AS night, ((
        SELECT count(*) FROM shifts s JOIN performances p ON p.id = s.performance_id
        WHERE p.status <> 'CANCELLED' AND p.starts_at >= ${start} AND p.starts_at < ${end} AND s.status IN ('OPEN', 'DECLINED')
      ) + (
        SELECT count(*) FROM bar_opening_shifts b JOIN bar_openings o ON o.id = b.opening_id
        WHERE o.status = 'PLANNED' AND o.starts_at >= ${start} AND o.starts_at < ${end} AND b.status IN ('OPEN', 'DECLINED')
      )) AS open, (
        SELECT count(*) FROM performances p
        WHERE p.status <> 'CANCELLED' AND p.starts_at >= ${start} AND p.starts_at < ${end}
          AND EXISTS (SELECT 1 FROM shifts d WHERE d.performance_id = p.id AND d.role = 'DUTY_MANAGER' AND d.status <> 'CANCELLED')
          AND NOT EXISTS (SELECT 1 FROM shifts d WHERE d.performance_id = p.id AND d.role = 'DUTY_MANAGER' AND d.status = 'CONFIRMED')
      ) AS withoutDutyManager`
  }), sql` UNION ALL `)
}

async function rotaWeek(): Promise<RotaWeekLine[]> {
  const rows = await db.all<RotaWeekLine>(rotaWeekQuery(currentShowNight()))
  return rotaWeekLines(rows.map(row => ({ night: row.night, open: Number(row.open), withoutDutyManager: Number(row.withoutDutyManager) })))
}

// Each part is read only for a reader who could finish it: the rota's owner, the bar's, or whoever counts.
export async function consoleOverview(event: H3Event, permissions: ReadonlySet<Permission>): Promise<ConsoleOverview> {
  const holds = (permission: Permission): boolean => permissions.has(permission)
  const bar = holds('bar.read')
  const stocktakes = bar || holds('bar.stocktake')

  const { from, to } = showNightBounds(currentShowNight())
  const [eligibility, facts, tonight, routing, firstRun, unfiled, week] = await Promise.all([
    holds('rota.read') ? roleEligibilities(event) : undefined,
    stocktakes ? db.all<BarSetUp>(barSetUpQuery()).then(([row]) => row) : undefined,
    OPERATIONAL_PERMISSIONS.some(holds) ? performancesOnNight(currentShowNight()) : null,
    holds('safety.write') ? db.all<{ anySeverityRoutes: number }>(safetyRoutingQuery()).then(([row]) => Boolean(row?.anySeverityRoutes)) : undefined,
    holds('roles.grant')
      ? db.all<Record<FirstRunStep, number>>(firstRunQuery()).then(([row]) =>
          firstRunLines(Object.fromEntries(FIRST_RUN_STEPS.map(step => [step, Boolean(row?.[step])])) as Record<FirstRunStep, boolean>))
      : null,
    holds('emergency-card.write')
      ? db.all<{ venueName: string }>(unfiledTonightQuery(Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000))).then(rows => rows.map(row => row.venueName))
      : undefined,
    holds('rota.read') ? rotaWeek() : null,
  ])

  const qualified = eligibility ? await qualifiedCounts(eligibility) : undefined

  return {
    setUp: setUpLines({
      eligibility,
      qualified,
      anythingOnHand: bar && facts ? Boolean(facts.anythingOnHand) : undefined,
      anyStocktake: stocktakes && facts ? Boolean(facts.anyStocktake) : undefined,
      allergensUnknown: bar && facts ? Number(facts.allergensUnknown) : undefined,
      anySeverityRoutes: routing,
      venuesWithoutCard: unfiled,
    }),
    tonight: tonight === null ? null : tonightLines(tonight),
    firstRun,
    rotaWeek: week,
  }
}
