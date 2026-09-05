import { is, sql } from 'drizzle-orm'
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'

export interface ExportManifest {
  generatedAt: string
  tables: Record<string, number>
  ledgerTotalPence: number
}

// Row counts and the ledger total, not the rows: what a drill reconciles against production,
// never a second copy of personal data outside the ledger's own governance (0011, K-108 criterion 2).
export async function buildExportManifest(): Promise<ExportManifest> {
  const tables: Record<string, number> = {}
  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) continue
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(value)
    tables[getTableConfig(value).name] = Number(row?.count ?? 0)
  }

  const [ledger] = await db.select({ total: sql<number>`coalesce(sum(${schema.ledgerEntries.totalPence}), 0)` })
    .from(schema.ledgerEntries)

  return { generatedAt: new Date().toISOString(), tables, ledgerTotalPence: Number(ledger?.total ?? 0) }
}

export type ExportResult
  = | { ok: true, objectKey: string, tableCount: number }
    | { ok: false, error: string }

// Weekly, to R2 through the `BLOB` binding: storage independent of D1 (K-108 criterion 1). A
// failure returns rather than throws, so the task can audit it instead of the cron swallowing it.
export async function runWeeklyExport(): Promise<ExportResult> {
  try {
    const manifest = await buildExportManifest()
    const objectKey = `backups/${manifest.generatedAt.slice(0, 10)}.json`
    await blob.put(objectKey, JSON.stringify(manifest), { contentType: 'application/json' })
    return { ok: true, objectKey, tableCount: Object.keys(manifest.tables).length }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 100) : 'unknown error' }
  }
}
