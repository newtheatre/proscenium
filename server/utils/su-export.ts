import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (0055).
import { auditedWrite } from './audit'
import { auditEntry, changes } from '#shared/utils/audit'
import type { NominalMappingInput, NominalMapping, SuExportRow } from '#shared/utils/su-export'
import type { SQL } from 'drizzle-orm'

// I-108. `su_nominal_mappings` is committee configuration, mutable and seeded by migration like
// `incident_severity_config` (E-116); the export itself reads ledger lines straight, unaggregated.

export function nominalMappingsQuery(): SQL {
  return sql`
    SELECT m.kind AS kind, m.source AS source, m.nominal_code AS nominalCode,
           u.name AS updatedByName, m.updated_at AS updatedAt
    FROM su_nominal_mappings m
    LEFT JOIN users u ON u.id = m.updated_by
    ORDER BY m.kind, m.source
  `
}

export async function nominalMappings(): Promise<NominalMapping[]> {
  return db.all<NominalMapping>(nominalMappingsQuery())
}

// Every row is seeded by migration (one per known kind/source pair), so this is always an
// UPDATE: nothing here ever creates or removes a pair, only changes what it maps to.
export async function setNominalMapping(input: NominalMappingInput, actorId: string): Promise<boolean> {
  const [current] = await db.all<{ nominalCode: string | null }>(sql`
    SELECT nominal_code AS nominalCode FROM su_nominal_mappings WHERE kind = ${input.kind} AND source = ${input.source}
  `)
  if (!current) return false

  const write = db.run(sql`
    UPDATE su_nominal_mappings SET nominal_code = ${input.nominalCode}, updated_by = ${actorId}, updated_at = unixepoch()
    WHERE kind = ${input.kind} AND source = ${input.source}
  `)
  const entry = auditEntry({
    actorId,
    action: 'finance.nominal-mapping.changed',
    target: `su-nominal-mapping:${input.kind}:${input.source}`,
    detail: changes({ nominalCode: [current.nominalCode, input.nominalCode] }),
  })
  return auditedWrite(write, entry)
}

// One row per ledger line, never aggregated: category and nominal code are read straight off
// the mapping table, and a line with no mapping still exports with a null code (criterion 3).
export function suExportQuery(fromDay: string, toDay: string): SQL {
  return sql`
    SELECT le.london_day AS londonDay, ll.kind AS kind, le.source AS source,
           m.nominal_code AS nominalCode, ll.amount_pence AS amountPence
    FROM ledger_lines ll
    JOIN ledger_entries le ON le.id = ll.entry_id
    LEFT JOIN su_nominal_mappings m ON m.kind = ll.kind AND m.source = le.source
    WHERE le.london_day BETWEEN ${fromDay} AND ${toDay}
    ORDER BY le.london_day, le.happened_at, ll.id
  `
}

export async function suExportRows(fromDay: string, toDay: string): Promise<SuExportRow[]> {
  return db.all<SuExportRow>(suExportQuery(fromDay, toDay))
}
