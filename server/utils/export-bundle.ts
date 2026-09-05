import { sql } from 'drizzle-orm'
import { toCsv } from '#server/utils/csv'
import { EXPORTED_TABLES } from '#shared/utils/personal-data'

// Everything the theatre holds about one person, built in one pass from the registry, so a module
// that joins the registry joins the export without anybody remembering to add it (K-110).

export interface Bundle {
  exportedAt: string
  about: { id: string, name: string, email: string }
  sections: Record<string, Record<string, unknown>[]>
  csv: Record<string, string>
}

// Column and table names come from the registry, never from a request, so identifiers are ours.
const identifiers = (names: string[]): ReturnType<typeof sql.join> =>
  sql.join(names.map(name => sql.identifier(name)), sql`, `)

// A stored epoch is a moment, not a number the reader has to convert.
function readable(value: unknown, column: string): unknown {
  if (typeof value !== 'number' || !column.endsWith('_at')) return value
  return formatLondon(new Date(value * 1000), { dateStyle: 'full', timeStyle: 'short' })
}

export async function buildBundle(account: AccountRow): Promise<Bundle> {
  const sections: Record<string, Record<string, unknown>[]> = {}

  for (const entry of EXPORTED_TABLES) {
    const rows = await db.all<Record<string, unknown>>(sql`
      select ${identifiers(entry.columns!)}
      from ${sql.identifier(entry.name)}
      where ${sql.identifier(entry.column)} = ${account.id}
    `)

    sections[entry.section!] = rows.map(row =>
      Object.fromEntries(Object.entries(row).map(([column, value]) => [column, readable(value, column)])))
  }

  return {
    exportedAt: new Date().toISOString(),
    about: { id: account.id, name: account.name, email: account.email },
    sections,
    csv: Object.fromEntries(Object.entries(sections).map(([section, rows]) => [section, toCsv(rows)])),
  }
}
