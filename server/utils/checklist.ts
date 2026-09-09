import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { showNightBounds } from '#shared/utils/show-night'
import type { ChecklistItemInput, Phase, SystemCheck } from '#shared/utils/checklist'
import type { SQL } from 'drizzle-orm'

// The pre and post-show checklist (E-114). Configuration in `checklist_items`, stamped onto a
// venue's night the first time it is touched (E-101's own pattern), ticked or exempted from there.

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

export function stampsForNightQuery(venueId: string, night: string): SQL {
  return sql`
    SELECT ${STAMP_COLUMNS}
    FROM checklist_stamps cs
    LEFT JOIN users u1 ON u1.id = cs.ticked_by
    LEFT JOIN users u2 ON u2.id = cs.exempted_by
    WHERE cs.venue_id = ${venueId} AND cs.night = ${night}
    ORDER BY ${phaseOrder(sql`cs.phase`)}, cs.sort, cs.label COLLATE NOCASE
  `
}

type RawStampRow = Omit<ChecklistStampRow, 'required' | 'exempted'> & { required: number, exempted: number }

async function readStamps(venueId: string, night: string): Promise<RawStampRow[]> {
  return db.all(stampsForNightQuery(venueId, night))
}

// A stamp for one item, conflict-proof the same way `ensureStampedStatement` below is; kept for
// a test or a caller that already holds one item rather than a whole venue's night.
export function stampStatement(item: ChecklistItemRow, venueId: string, night: string, id: string): SQL {
  return sql`
    INSERT INTO checklist_stamps (id, venue_id, night, item_id, phase, label, sort, required, system_check)
    VALUES (${id}, ${venueId}, ${night}, ${item.id}, ${item.phase}, ${item.label}, ${item.sort}, ${item.required ? 1 : 0}, ${item.systemCheck})
    ON CONFLICT (venue_id, night, item_id) DO NOTHING
  `
}

// Every active item stamped in one set-based write, `rota.ts`'s own shape: no read first, a
// fixed parameter count, and no early exit needed since a stamped night conflicts on every row.
export function ensureStampedStatement(venueId: string, night: string): SQL {
  return sql`
    INSERT INTO checklist_stamps (id, venue_id, night, item_id, phase, label, sort, required, system_check)
    SELECT lower(hex(randomblob(16))), ${venueId}, ${night}, i.id, i.phase, i.label, i.sort, i.required, i.system_check
    FROM checklist_items i
    WHERE i.venue_id = ${venueId} AND i.active = 1
    ON CONFLICT (venue_id, night, item_id) DO NOTHING
    RETURNING id
  `
}

export async function ensureStamped(venueId: string, night: string): Promise<void> {
  await db.all(ensureStampedStatement(venueId, night))
}

// No reservation for tonight's performances here is left in a status a show should have resolved
// by its own end (criterion 3). Needs a door scan D-126 does not build yet (docs/known-issues.md).
export function noShowHoldsReleasedQuery(venueId: string, night: string): SQL {
  const { from, to } = showNightBounds(night)
  return sql`
    SELECT count(*) AS unresolved
    FROM reservations r
    JOIN performances p ON p.id = r.performance_id
    WHERE p.venue_id = ${venueId}
      AND p.starts_at >= ${Math.floor(from.getTime() / 1000)} AND p.starts_at < ${Math.floor(to.getTime() / 1000)}
      AND r.status IN ('PENDING', 'COLLECTED')
  `
}

export async function noShowHoldsReleased(venueId: string, night: string): Promise<boolean> {
  const [row] = await db.all<{ unresolved: number }>(noShowHoldsReleasedQuery(venueId, night))
  return (row?.unresolved ?? 0) === 0
}

// Every incident tonight at this venue carries an `incident.reviewed` audit entry. Venue-scoped
// like `noShowHoldsReleasedQuery`, so a night two venues both run never crosses over (E-127).
export function incidentsReviewedQuery(venueId: string, night: string): SQL {
  const { from, to } = showNightBounds(night)
  return sql`
    SELECT count(*) AS unreviewed
    FROM incidents i
    JOIN performances p ON p.id = i.performance_id
    WHERE p.venue_id = ${venueId}
      AND i.happened_at >= ${Math.floor(from.getTime() / 1000)} AND i.happened_at < ${Math.floor(to.getTime() / 1000)}
      AND NOT EXISTS (
        SELECT 1 FROM audit_log a WHERE a.action = 'incident.reviewed' AND a.target = 'incident:' || i.id
      )
  `
}

export async function incidentsReviewed(venueId: string, night: string): Promise<boolean> {
  const [row] = await db.all<{ unreviewed: number }>(incidentsReviewedQuery(venueId, night))
  return (row?.unreviewed ?? 0) === 0
}

// Exhaustive on purpose: a third `SystemCheck` means touching this and `saysSystemCheck()`, not
// only writing a query (docs/known-issues.md); `never` refuses to compile until both are.
async function evaluate(check: SystemCheck, venueId: string, night: string): Promise<boolean> {
  switch (check) {
    case 'NO_SHOW_HOLDS_RELEASED': return noShowHoldsReleased(venueId, night)
    case 'INCIDENTS_REVIEWED': return incidentsReviewed(venueId, night)
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

// Tonight's checklist, stamped if it is not already, every system-verified item read live rather
// than stored (criterion 3). At most two distinct checks exist, so each resolves once and is shared.
export async function checklistFor(venueId: string, night: string): Promise<ChecklistEntry[]> {
  await ensureStamped(venueId, night)
  const stamps = await readStamps(venueId, night)

  const distinctChecks = [...new Set(stamps.map(stamp => stamp.systemCheck).filter((check): check is SystemCheck => check !== null))]
  const resolved = new Map(await Promise.all(
    distinctChecks.map(async check => [check, await evaluate(check, venueId, night)] as const),
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

// Predicated on the stamp being unticked, hand-tickable, not already exempted and this duty
// manager's own venue and night, decided from `RETURNING` via `auditedWrite()` (0049).
export function tickStatement(stampId: string, venueId: string, night: string, tickedBy: string): SQL {
  return sql`
    UPDATE checklist_stamps
    SET ticked_by = ${tickedBy}, ticked_at = unixepoch()
    WHERE id = ${stampId} AND venue_id = ${venueId} AND night = ${night}
      AND system_check IS NULL AND ticked_at IS NULL AND exempted = 0
    RETURNING id
  `
}

// Guarded like `tickStatement`, `system_check IS NULL` included: `checklistFor` never reads
// `exempted` for a system-verified stamp, so recording one there would audit a no-op.
export function exemptStatement(stampId: string, venueId: string, night: string, reason: string, exemptedBy: string): SQL {
  return sql`
    UPDATE checklist_stamps
    SET exempted = 1, exempt_reason = ${reason}, exempted_by = ${exemptedBy}, exempted_at = unixepoch()
    WHERE id = ${stampId} AND venue_id = ${venueId} AND night = ${night}
      AND system_check IS NULL AND ticked_at IS NULL AND exempted = 0
    RETURNING id
  `
}

export interface ChecklistCloseRow {
  venueId: string
  night: string
  closedByName: string
  closedAt: number
}

export async function closeFor(venueId: string, night: string): Promise<ChecklistCloseRow | null> {
  const [row] = await db.all<ChecklistCloseRow>(sql`
    SELECT cc.venue_id AS venueId, cc.night AS night, u.name AS closedByName, cc.closed_at AS closedAt
    FROM checklist_closes cc JOIN users u ON u.id = cc.closed_by
    WHERE cc.venue_id = ${venueId} AND cc.night = ${night}
  `)
  return row ?? null
}

export function closeStatement(venueId: string, night: string, closedBy: string, id: string): SQL {
  return sql`
    INSERT INTO checklist_closes (id, venue_id, night, closed_by)
    SELECT ${id}, ${venueId}, ${night}, ${closedBy}
    WHERE NOT EXISTS (SELECT 1 FROM checklist_closes WHERE venue_id = ${venueId} AND night = ${night})
    RETURNING id
  `
}
