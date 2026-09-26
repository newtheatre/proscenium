import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { roleHoldersQuery } from './announcements'
import { configValue } from './configuration'
import { cardFiled } from './venue-emergency'
import { SHIFT_ROLES } from '#shared/utils/rota'
import { eligibilityStanding } from '#shared/utils/rota-readiness'
import type { SystemCheck } from '#shared/utils/checklist'
import type { ShiftRole } from '#shared/utils/rota'
import type { BoardReadiness, RoleEligibility, VenueReadiness } from '#shared/utils/rota-readiness'
import type { ModuleLifecycle } from '#shared/utils/training'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// What a show night needs set up, read by the rota's owner from one card (issue 1318), and the
// eligibility line /api/health reports beside its own `ok`.

// Venues we run are a handful, so this is a bound on a mistake rather than a page (0006).
const READINESS_VENUE_CAP = 50

// The committee's mapping, read once per request and reused for every shift on the page: no
// per-row query and no cache window (E-103 criteria 1 and 4).
export async function shiftRoleRules(event?: H3Event): Promise<Record<ShiftRole, string | null>> {
  const [DUTY_MANAGER, DOOR, BAR] = await Promise.all([
    configValue(event, 'SHIFT_ELIGIBILITY_DUTY_MANAGER_MODULE'),
    configValue(event, 'SHIFT_ELIGIBILITY_DOOR_MODULE'),
    configValue(event, 'SHIFT_ELIGIBILITY_BAR_MODULE'),
  ])
  return { DUTY_MANAGER, DOOR, BAR }
}

export function gatingModulesQuery(ids: readonly string[]): SQL {
  return sql`
    SELECT id, name, status FROM modules
    WHERE id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
    ORDER BY id
  `
}

interface GatingModule { id: string, name: string, status: ModuleLifecycle }

// At most three ids, one per shift role, read from configuration rather than a result set.
export async function gatingModules(named: readonly (string | null)[]): Promise<Map<string, GatingModule>> {
  const ids = [...new Set(named.filter((id): id is string => id !== null))]
  if (ids.length === 0) return new Map()
  const rows = await db.all<GatingModule>(gatingModulesQuery(ids))
  return new Map(rows.map(row => [row.id, row]))
}

export async function roleEligibilities(event?: H3Event): Promise<RoleEligibility[]> {
  const rules = await shiftRoleRules(event)
  const modules = await gatingModules(Object.values(rules))

  return SHIFT_ROLES.map((role) => {
    const moduleId = rules[role]
    const held = moduleId === null ? undefined : modules.get(moduleId)
    return { role, moduleId, moduleName: held?.name ?? null, standing: eligibilityStanding(moduleId, held?.status ?? null) }
  })
}

// Our own venues only: an external one is staffed by hand and a retired one takes no new night.
export function venueReadinessQuery(): SQL {
  return sql`
    SELECT v.id AS venueId, v.name AS venueName,
      (SELECT coalesce(sum(t."count"), 0) FROM shift_templates t WHERE t.venue_id = v.id) AS templateSlots,
      (SELECT group_concat(DISTINCT ci.system_check) FROM checklist_items ci
        WHERE ci.venue_id = v.id AND ci.active = 1 AND ci.system_check IS NOT NULL) AS systemChecks,
      ${cardFiled('v')} AS emergencyFiled
    FROM venues v
    WHERE v.is_external = 0 AND v.archived = 0
    ORDER BY v.name COLLATE NOCASE
    LIMIT ${READINESS_VENUE_CAP}
  `
}

interface VenueReadinessRow { venueId: string, venueName: string, templateSlots: number, systemChecks: string | null, emergencyFiled: number }

export async function venueReadiness(): Promise<VenueReadiness[]> {
  const rows = await db.all<VenueReadinessRow>(venueReadinessQuery())
  return rows.map(row => ({
    ...row,
    systemChecks: (row.systemChecks?.split(',') ?? []) as SystemCheck[],
    emergencyFiled: row.emergencyFiled === 1,
  }))
}

export function boardReadinessQuery(): SQL {
  return sql`
    SELECT (SELECT count(*) FROM backstage_presets WHERE active = 1) AS presets,
           (SELECT count(*) FROM backstage_milestone_types WHERE active = 1) AS milestones
  `
}

export async function boardReadiness(): Promise<BoardReadiness> {
  const [row] = await db.all<BoardReadiness>(boardReadinessQuery())
  return row ?? { presets: 0, milestones: 0 }
}

// The committee role by name, not every rota.write holder: a member asks a person, and an
// administrator is not the one who opens a role (issue 1318). An erased holder is never named.
const OFFICERS_NAMED = 3

export function fohManagersQuery(nowEpoch: number): SQL {
  return sql`
    SELECT u.name AS name FROM users u
    WHERE u.disabled = 0 AND u.id IN (${roleHoldersQuery('FOH_MANAGER', nowEpoch)})
    ORDER BY u.name COLLATE NOCASE
    LIMIT ${OFFICERS_NAMED}
  `
}

export async function fohManagerNames(): Promise<string[]> {
  const rows = await db.all<{ name: string }>(fohManagersQuery(Math.floor(Date.now() / 1000)))
  return rows.map(row => row.name)
}
