import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { ChecklistItemInput, Phase, SystemCheck } from '#shared/utils/checklist'
import type { SQL } from 'drizzle-orm'

// The pre and post-show checklist (E-114), keyed to a performance rather than a venue and a
// night (E-128). Configuration in `checklist_items`, stamped once (E-101's own pattern).

export interface ChecklistItemRow {
  id: string
  venueId: string
  phase: Phase
  label: string
  sort: number
  required: boolean
  systemCheck: SystemCheck | null
  active: boolean
  updatedAt: number
}

const ITEM_COLUMNS = sql`
  id AS id, venue_id AS venueId, phase AS phase, label AS label, sort AS sort,
  required AS required, system_check AS systemCheck, active AS active, updated_at AS updatedAt
`

// `'POST'` sorts before `'PRE'` as text (the second letter, `O` before `R`), which inverts the
// running order. Sorted explicitly so pre-show always lists above post-show.
function phaseOrder(column: SQL): SQL {
  return sql`CASE WHEN ${column} = 'PRE' THEN 0 ELSE 1 END`
}

export function itemsForVenueQuery(venueId: string, includeRetired: boolean): SQL {
  const predicate = includeRetired ? sql`` : sql` AND active = 1`
  return sql`SELECT ${ITEM_COLUMNS} FROM checklist_items WHERE venue_id = ${venueId}${predicate} ORDER BY ${phaseOrder(sql`phase`)}, sort, label COLLATE NOCASE`
}

export async function itemsForVenue(venueId: string, includeRetired = false): Promise<ChecklistItemRow[]> {
  const rows = await db.all<{ required: number, active: number } & Omit<ChecklistItemRow, 'required' | 'active'>>(itemsForVenueQuery(venueId, includeRetired))
  return rows.map(row => ({ ...row, required: row.required === 1, active: row.active === 1 }))
}

export interface VenueChecklist {
  venueId: string
  venueName: string
  items: ChecklistItemRow[]
}

// Every venue and its active checklist items, for the committee's own overview screen, the same
// shape `listVenueTemplates()` returns for E-101.
export async function listVenueChecklists(): Promise<VenueChecklist[]> {
  const rows = await db.all<{ venueId: string, venueName: string, id: string | null, phase: Phase | null, label: string | null, sort: number | null, required: number | null, systemCheck: SystemCheck | null, active: number | null, updatedAt: number | null }>(sql`
    SELECT v.id AS venueId, v.name AS venueName,
           i.id AS id, i.phase AS phase, i.label AS label, i.sort AS sort,
           i.required AS required, i.system_check AS systemCheck, i.active AS active, i.updated_at AS updatedAt
    FROM venues v
    LEFT JOIN checklist_items i ON i.venue_id = v.id AND i.active = 1
    ORDER BY v.name COLLATE NOCASE, ${phaseOrder(sql`i.phase`)}, i.sort, i.label COLLATE NOCASE
  `)

  const venues = new Map<string, VenueChecklist>()
  for (const row of rows) {
    const held = venues.get(row.venueId) ?? { venueId: row.venueId, venueName: row.venueName, items: [] }
    if (row.id !== null) {
      held.items.push({
        id: row.id, venueId: row.venueId, phase: row.phase!, label: row.label!, sort: row.sort!,
        required: row.required === 1, systemCheck: row.systemCheck, active: row.active === 1, updatedAt: row.updatedAt!,
      })
    }
    venues.set(row.venueId, held)
  }
  return [...venues.values()]
}

export function insertItemStatement(input: ChecklistItemInput, updatedBy: string, id: string): SQL {
  return sql`
    INSERT INTO checklist_items (id, venue_id, phase, label, sort, required, system_check, updated_by)
    VALUES (${id}, ${input.venueId}, ${input.phase}, ${input.label}, ${input.sort}, ${input.required ? 1 : 0}, ${input.systemCheck}, ${updatedBy})
  `
}

export function updateItemStatement(id: string, input: ChecklistItemInput, updatedBy: string): SQL {
  return sql`
    UPDATE checklist_items
    SET phase = ${input.phase}, label = ${input.label}, sort = ${input.sort}, required = ${input.required ? 1 : 0},
        system_check = ${input.systemCheck}, updated_by = ${updatedBy}, updated_at = unixepoch()
    WHERE id = ${id}
  `
}

export function retireItemStatement(id: string, active: boolean, updatedBy: string): SQL {
  return sql`UPDATE checklist_items SET active = ${active ? 1 : 0}, updated_by = ${updatedBy}, updated_at = unixepoch() WHERE id = ${id}`
}

export interface ChecklistStampRow {
  id: string
  itemId: string
  phase: Phase
  label: string
  sort: number
  required: boolean
  systemCheck: SystemCheck | null
  tickedBy: string | null
  tickedByName: string | null
  tickedAt: number | null
  exempted: boolean
  exemptReason: string | null
  exemptedByName: string | null
  exemptedAt: number | null
}

const STAMP_COLUMNS = sql`
  cs.id AS id, cs.item_id AS itemId, cs.phase AS phase, cs.label AS label, cs.sort AS sort,
  cs.required AS required, cs.system_check AS systemCheck,
  cs.ticked_by AS tickedBy, u1.name AS tickedByName, cs.ticked_at AS tickedAt,
  cs.exempted AS exempted, cs.exempt_reason AS exemptReason, u2.name AS exemptedByName, cs.exempted_at AS exemptedAt
`

export function stampsForPerformanceQuery(performanceId: string): SQL {
  return sql`
    SELECT ${STAMP_COLUMNS}
    FROM checklist_stamps cs
    LEFT JOIN users u1 ON u1.id = cs.ticked_by
    LEFT JOIN users u2 ON u2.id = cs.exempted_by
    WHERE cs.performance_id = ${performanceId}
    ORDER BY ${phaseOrder(sql`cs.phase`)}, cs.sort, cs.label COLLATE NOCASE
  `
}

type RawStampRow = Omit<ChecklistStampRow, 'required' | 'exempted'> & { required: number, exempted: number }

async function readStamps(performanceId: string): Promise<RawStampRow[]> {
  return db.all(stampsForPerformanceQuery(performanceId))
}

// A stamp for one item, conflict-proof the same way `ensureStampedStatement` below is; kept for
// a test or a caller that already holds one item rather than a whole performance's set.
export function stampStatement(item: ChecklistItemRow, performanceId: string, id: string): SQL {
  return sql`
    INSERT INTO checklist_stamps (id, performance_id, item_id, phase, label, sort, required, system_check)
    VALUES (${id}, ${performanceId}, ${item.id}, ${item.phase}, ${item.label}, ${item.sort}, ${item.required ? 1 : 0}, ${item.systemCheck})
    ON CONFLICT (performance_id, item_id) DO NOTHING
  `
}

// Every active item stamped in one set-based write, `rota.ts`'s own shape: a stamped performance
// conflicts on every row. The venue, and so which items, resolves through the performance (E-128).
export function ensureStampedStatement(performanceId: string): SQL {
  return sql`
    INSERT INTO checklist_stamps (id, performance_id, item_id, phase, label, sort, required, system_check)
    SELECT lower(hex(randomblob(16))), ${performanceId}, i.id, i.phase, i.label, i.sort, i.required, i.system_check
    FROM checklist_items i
    JOIN performances p ON p.venue_id = i.venue_id
    WHERE p.id = ${performanceId} AND i.active = 1
    ON CONFLICT (performance_id, item_id) DO NOTHING
    RETURNING id
  `
}

export async function ensureStamped(performanceId: string): Promise<void> {
  await db.all(ensureStampedStatement(performanceId))
}

// No reservation for this performance is left in a status a show should have resolved by its
// own end (criterion 3). Needs a door scan D-126 does not build yet (docs/known-issues.md).
export function noShowHoldsReleasedQuery(performanceId: string): SQL {
  return sql`
    SELECT count(*) AS unresolved
    FROM reservations r
    WHERE r.performance_id = ${performanceId}
      AND r.status IN ('PENDING', 'COLLECTED')
  `
}

export async function noShowHoldsReleased(performanceId: string): Promise<boolean> {
  const [row] = await db.all<{ unresolved: number }>(noShowHoldsReleasedQuery(performanceId))
  return (row?.unresolved ?? 0) === 0
}

// Every incident tonight against this performance carries an `incident.reviewed` audit entry
// (E-128: performance-scoped, so a matinee's checklist never waits on the evening's incidents).
export function incidentsReviewedQuery(performanceId: string): SQL {
  return sql`
    SELECT count(*) AS unreviewed
    FROM incidents i
    WHERE i.performance_id = ${performanceId}
      AND NOT EXISTS (
        SELECT 1 FROM audit_log a WHERE a.action = 'incident.reviewed' AND a.target = 'incident:' || i.id
      )
  `
}

export async function incidentsReviewed(performanceId: string): Promise<boolean> {
  const [row] = await db.all<{ unreviewed: number }>(incidentsReviewedQuery(performanceId))
  return (row?.unreviewed ?? 0) === 0
}

// Exhaustive on purpose: a third `SystemCheck` means touching this and `saysSystemCheck()`, not
// only writing a query (docs/known-issues.md); `never` refuses to compile until both are.
async function evaluate(check: SystemCheck, performanceId: string): Promise<boolean> {
  switch (check) {
    case 'NO_SHOW_HOLDS_RELEASED': return noShowHoldsReleased(performanceId)
    case 'INCIDENTS_REVIEWED': return incidentsReviewed(performanceId)
    default: return check satisfies never
  }
}

export interface ChecklistEntry {
  id: string
  itemId: string
  phase: Phase
  label: string
  required: boolean
  systemCheck: SystemCheck | null
  done: boolean
  tickedByName: string | null
  tickedAt: number | null
  exempted: boolean
  exemptReason: string | null
  exemptedByName: string | null
  exemptedAt: number | null
}

// This performance's checklist, stamped if it is not already, every system-verified item read
// live rather than stored (criterion 3). At most two distinct checks exist, so each resolves once.
export async function checklistFor(performanceId: string): Promise<ChecklistEntry[]> {
  await ensureStamped(performanceId)
  const stamps = await readStamps(performanceId)

  const distinctChecks = [...new Set(stamps.map(stamp => stamp.systemCheck).filter((check): check is SystemCheck => check !== null))]
  const resolved = new Map(await Promise.all(
    distinctChecks.map(async check => [check, await evaluate(check, performanceId)] as const),
  ))

  const entries: ChecklistEntry[] = []
  for (const stamp of stamps) {
    const systemDone = stamp.systemCheck ? (resolved.get(stamp.systemCheck) ?? false) : null
    entries.push({
      id: stamp.id,
      itemId: stamp.itemId,
      phase: stamp.phase,
      label: stamp.label,
      required: stamp.required === 1,
      systemCheck: stamp.systemCheck,
      done: systemDone ?? (stamp.tickedAt !== null || stamp.exempted === 1),
      tickedByName: stamp.tickedByName,
      tickedAt: stamp.tickedAt,
      exempted: stamp.exempted === 1,
      exemptReason: stamp.exemptReason,
      exemptedByName: stamp.exemptedByName,
      exemptedAt: stamp.exemptedAt,
    })
  }
  return entries
}

// Predicated on the stamp being unticked, hand-tickable, not already exempted and this
// performance's own, decided from `RETURNING` via `auditedWrite()` (0049).
export function tickStatement(stampId: string, performanceId: string, tickedBy: string): SQL {
  return sql`
    UPDATE checklist_stamps
    SET ticked_by = ${tickedBy}, ticked_at = unixepoch()
    WHERE id = ${stampId} AND performance_id = ${performanceId}
      AND system_check IS NULL AND ticked_at IS NULL AND exempted = 0
    RETURNING id
  `
}

// Guarded like `tickStatement`, `system_check IS NULL` included: `checklistFor` never reads
// `exempted` for a system-verified stamp, so recording one there would audit a no-op.
export function exemptStatement(stampId: string, performanceId: string, reason: string, exemptedBy: string): SQL {
  return sql`
    UPDATE checklist_stamps
    SET exempted = 1, exempt_reason = ${reason}, exempted_by = ${exemptedBy}, exempted_at = unixepoch()
    WHERE id = ${stampId} AND performance_id = ${performanceId}
      AND system_check IS NULL AND ticked_at IS NULL AND exempted = 0
    RETURNING id
  `
}

export interface ChecklistCloseRow {
  performanceId: string
  closedByName: string
  closedAt: number
}

export async function closeFor(performanceId: string): Promise<ChecklistCloseRow | null> {
  const [row] = await db.all<ChecklistCloseRow>(sql`
    SELECT cc.performance_id AS performanceId, u.name AS closedByName, cc.closed_at AS closedAt
    FROM checklist_closes cc JOIN users u ON u.id = cc.closed_by
    WHERE cc.performance_id = ${performanceId}
  `)
  return row ?? null
}

export function closeStatement(performanceId: string, closedBy: string, id: string): SQL {
  return sql`
    INSERT INTO checklist_closes (id, performance_id, closed_by)
    SELECT ${id}, ${performanceId}, ${closedBy}
    WHERE NOT EXISTS (SELECT 1 FROM checklist_closes WHERE performance_id = ${performanceId})
    RETURNING id
  `
}
