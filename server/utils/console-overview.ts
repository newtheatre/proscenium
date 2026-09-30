import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { queuesFor, setUpLines, tonightLines } from '#shared/utils/console-overview'
import { OPEN_STATUSES } from '#shared/utils/external-requests'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { accessProfilesList } from '#shared/utils/access-profiles-list'
import { membershipClaimsList } from '#shared/utils/membership-claims-list'
import { OPERATIONAL_PERMISSIONS } from '#shared/utils/roles'
import { currentShowNight } from '#shared/utils/show-night'
import { accessProfilesClause } from './access-profiles'
import { allergensUnansweredCount, onHandColumn } from './bar'
import { STOCK_COUNTED } from './bar-linkage'
import { claimsClause } from './membership-claims'
import { performancesOnNight } from './performances'
import { roleEligibilities } from './rota-readiness'
import { demandScope } from './training-demand'
import type { ConsoleOverview } from '#shared/utils/console-overview'
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

// Each part is read only for a reader who could finish it: the rota's owner, the bar's, or whoever counts.
export async function consoleOverview(event: H3Event, permissions: ReadonlySet<Permission>): Promise<ConsoleOverview> {
  const holds = (permission: Permission): boolean => permissions.has(permission)
  const bar = holds('bar.read')
  const stocktakes = bar || holds('bar.stocktake')

  const [eligibility, facts, tonight] = await Promise.all([
    holds('rota.read') ? roleEligibilities(event) : undefined,
    stocktakes ? db.all<BarSetUp>(barSetUpQuery()).then(([row]) => row) : undefined,
    OPERATIONAL_PERMISSIONS.some(holds) ? performancesOnNight(currentShowNight()) : null,
  ])

  return {
    setUp: setUpLines({
      eligibility,
      anythingOnHand: bar && facts ? Boolean(facts.anythingOnHand) : undefined,
      anyStocktake: stocktakes && facts ? Boolean(facts.anyStocktake) : undefined,
      allergensUnknown: bar && facts ? Number(facts.allergensUnknown) : undefined,
    }),
    tonight: tonight === null ? null : tonightLines(tonight),
  }
}
