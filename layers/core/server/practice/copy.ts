// The configuration copy (Practice mode, part 2, "The copy declaration"): every table a module marks
// `practice: 'copy'`, read through the kit's declarations as erasure and export read, each column
// passed through its own erasure rule, account columns pointed at the store's Practice staff.
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { all, useSetting } from '#kit'
import { useRegistry } from '#kit/registry'
import { ERASED, type ColumnMeta, type TableMeta } from '#kit/db'
import type { Statement } from '#kit/database'

/** The tables to copy, each after the tables it references, so every reference finds its row. */
function copiedTables(): { meta: TableMeta, table: unknown }[] {
  const copied = [...useRegistry().tables.values()].filter(t => t.meta.options.practice === 'copy')
  const byName = new Map(copied.map(t => [t.meta.name, t]))
  const ordered: typeof copied = []
  const visit = (t: typeof copied[number], seen: Set<string>) => {
    if (ordered.includes(t) || seen.has(t.meta.name)) return
    seen.add(t.meta.name)
    for (const fk of getTableConfig(t.table as never).foreignKeys) {
      const target = byName.get(getTableConfig(fk.reference().foreignTable as never).name)
      if (target && target !== t) visit(target, seen)
    }
    ordered.push(t)
  }
  for (const t of copied) visit(t, new Set())
  return ordered.map(({ meta, table }) => ({ meta, table }))
}

/** A value as the copy writes it: personal data through its erasure rule, special and sealed data never. */
export function copiedValue(meta: ColumnMeta, value: unknown, staffId: string): unknown {
  if (value === null || value === undefined) return null
  if (meta.class === 'special' || meta.encrypted || meta.class === 'perRow') return null
  if (meta.helper === 'account') return staffId
  if (meta.class !== 'personal' && meta.class !== 'freeText') return value
  if (meta.erase === 'anonymise') return ERASED.anonymise
  if (meta.erase === 'redact') return ERASED.redact
  if (meta.erase === 'keep') return value
  return null
}

/** Settings the copy leaves at their defaults: anything sensitive, or managed by the platform itself. */
function keptBack(table: string, row: Record<string, unknown>): boolean {
  if (table !== 'core_settings') return false
  const entry = useRegistry().settings.get(String(row.key))?.entry
  return !entry || !!entry.sensitive || !!entry.managed
}

/**
 * The statements that copy the theatre's setup into a store, read now from the real database. With
 * core.practice.copy-configuration off only the module switches come across (question 2).
 */
export async function copyStatements(staffId: string): Promise<Statement[]> {
  const own = await useSetting('core.practice.copy-configuration') as boolean
  const pageSize = await useSetting('core.units.set-rows-limit') as number
  const out: Statement[] = []
  for (const { meta } of copiedTables()) {
    if (!own && meta.name !== 'core_modules') continue
    const columns = Object.values(meta.columns)
    for (let offset = 0; ; offset += pageSize) {
      const rows = await all<Record<string, unknown>>(`SELECT * FROM "${meta.name}" ORDER BY 1 LIMIT ? OFFSET ?`, pageSize, offset)
      for (const row of rows) {
        if (keptBack(meta.name, row)) continue
        out.push({
          sql: `INSERT INTO "${meta.name}" (${columns.map(c => `"${c.sql}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          params: columns.map(c => copiedValue(c.meta, row[c.sql], staffId)),
        })
      }
      if (rows.length < pageSize) break
    }
  }
  return out
}
