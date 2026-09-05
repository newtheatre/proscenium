import { sql } from 'drizzle-orm'
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

// The one table in the registry holding ciphertext: its two encrypted columns are swapped for
// the decrypted answers before anything is formatted (D-127 criterion 4).
async function decryptAccessProfileRow(row: Record<string, unknown>, userId: string): Promise<Record<string, unknown>> {
  const { encrypted_payload: ciphertext, encryption_iv: iv, ...rest } = row
  if (typeof ciphertext !== 'string' || typeof iv !== 'string') return { ...rest, flags: null, requester_note: null, foh_note: null }
  const payload = await decryptAccessProfilePayload({ ciphertext, iv }, userId)
  return { ...rest, flags: payload.flags, requester_note: payload.requesterNote, foh_note: payload.fohNote }
}

// RFC 4180: every field quoted, inner quotes doubled, so a comma or a newline cannot end a row
// early. A leading =, +, - or @ is prefixed, because a spreadsheet reads one as a formula (D-129).
function csvField(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${guarded.replaceAll('"', '""')}"`
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const columns = Object.keys(rows[0]!)
  const lines = [columns.map(csvField).join(',')]
  for (const row of rows) lines.push(columns.map(column => csvField(row[column])).join(','))
  return `${lines.join('\r\n')}\r\n`
}

export async function buildBundle(account: AccountRow): Promise<Bundle> {
  const sections: Record<string, Record<string, unknown>[]> = {}

  for (const entry of EXPORTED_TABLES) {
    const rows = await db.all<Record<string, unknown>>(sql`
      select ${identifiers(entry.columns!)}
      from ${sql.identifier(entry.name)}
      where ${sql.identifier(entry.column)} = ${account.id}
    `)

    const readableRows = entry.name === 'access_profiles' ? await Promise.all(rows.map(row => decryptAccessProfileRow(row, account.id))) : rows

    sections[entry.section!] = readableRows.map(row =>
      Object.fromEntries(Object.entries(row).map(([column, value]) => [column, readable(value, column)])))
  }

  return {
    exportedAt: new Date().toISOString(),
    about: { id: account.id, name: account.name, email: account.email },
    sections,
    csv: Object.fromEntries(Object.entries(sections).map(([section, rows]) => [section, toCsv(rows)])),
  }
}
