import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { AgeCheckOutcome, IdType, RefusalReason } from '#shared/utils/age-checks'
import type { SQL } from 'drizzle-orm'

// The licensing export (E-119): any date range, CSV and PDF, nothing omitted. A technical bound
// rather than a policy one, so it is a constant and not a setting (0012, matching audit's own).
const EXPORT_LIMIT = 5000

export interface AgeCheckExportRow {
  id: string
  createdAt: number
  venueName: string | null
  outcome: AgeCheckOutcome
  idType: IdType | null
  reason: RefusalReason | null
  description: string
  product: string | null
  notes: string | null
  checkedByName: string
  supersedesId: string | null
  supersededBy: string | null
}

// Superseded entries included, with their supersedes links intact, so nothing is omitted
// (criterion 2). Time order, oldest first: this is a document read start to end, not a feed.
export function exportQuery(from: number, to: number): SQL {
  return sql`
    SELECT a.id AS id, a.created_at AS createdAt, v.name AS venueName,
           a.outcome AS outcome, a.id_type AS idType, a.reason AS reason,
           a.description AS description, a.product AS product, a.notes AS notes,
           u.name AS checkedByName, a.supersedes_id AS supersedesId,
           (SELECT s.id FROM age_checks s WHERE s.supersedes_id = a.id) AS supersededBy
    FROM age_checks a
    JOIN users u ON u.id = a.checked_by
    LEFT JOIN performances p ON p.id = a.performance_id
    LEFT JOIN venues v ON v.id = p.venue_id
    WHERE a.created_at >= ${from} AND a.created_at < ${to}
    ORDER BY a.created_at ASC
    LIMIT ${EXPORT_LIMIT}
  `
}

export async function exportRows(from: number, to: number): Promise<AgeCheckExportRow[]> {
  return db.all<AgeCheckExportRow>(exportQuery(from, to))
}

export interface AgeCheckPdfCells {
  when: string
  outcome: string
  idOrReason: string
  description: string
  product: string
  checkedBy: string
}

// The index signature is what `buildTablePdf` takes its rows as; the named fields are the columns.
export interface AgeCheckPdfRow extends AgeCheckPdfCells, Record<string, string> {
  row: string
  supersedes: string
  supersededBy: string
}

// An inspector reads a page, not a database: the correction chain points at a row on the page,
// and the ids stay in the CSV, which is the half a machine reads (E-119, K-128).
export function numberedPdfRows(
  rows: AgeCheckExportRow[],
  cells: (row: AgeCheckExportRow) => AgeCheckPdfCells = bareCells,
): AgeCheckPdfRow[] {
  const numbers = new Map(rows.map((row, at) => [row.id, at + 1]))
  const points = (id: string | null): string => {
    if (!id) return ''
    const at = numbers.get(id)
    return at === undefined ? 'Outside this period' : `row ${at}`
  }

  return rows.map((row, at) => ({
    row: String(at + 1),
    ...cells(row),
    supersedes: points(row.supersedesId),
    supersededBy: points(row.supersededBy),
  }))
}

// Dates and outcomes are said by the route, which holds the formatters; this is what is left.
function bareCells(row: AgeCheckExportRow): AgeCheckPdfCells {
  return {
    when: '',
    outcome: row.outcome,
    idOrReason: row.idType ?? row.reason ?? '',
    description: row.description,
    product: row.product ?? '',
    checkedBy: row.checkedByName,
  }
}
