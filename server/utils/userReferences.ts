import { db, schema } from '@nuxthub/db'
import { getTableName, is, sql } from 'drizzle-orm'
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core'

/**
 * Which tables still point at a user. Read from the Drizzle schema, so a new
 * `references(() => users.id)` cannot quietly reopen the delete hole (ADR-0014).
 */

interface UserReference { table: string, column: string }

function userReferences(): UserReference[] {
  const found: UserReference[] = []
  for (const table of Object.values(schema)) {
    if (!is(table, SQLiteTable)) continue
    const config = getTableConfig(table)
    for (const key of config.foreignKeys) {
      const reference = key.reference()
      if (getTableName(reference.foreignTable) !== 'users') continue
      for (const column of reference.columns) found.push({ table: config.name, column: column.name })
    }
  }
  return found
}

// Built once: the schema does not change while the isolate is alive.
const REFERENCES = userReferences()

/**
 * The tables holding a row that points at this user. One statement and one
 * bound parameter, whatever the schema grows to (ADR-0006).
 */
export async function tablesReferencingUser(userId: string): Promise<string[]> {
  if (!REFERENCES.length) return []

  // Identifiers come from the schema, never from a request, so raw is safe here.
  const terms = REFERENCES.map(reference =>
    `select distinct '${reference.table}' as "table" from "${reference.table}" `
    + `where "${reference.column}" = (select id from target)`,
  ).join(' union all ')

  const rows = await db.all<{ table: string }>(
    sql`with target(id) as (select ${userId}) ${sql.raw(terms)}`,
  )

  return [...new Set(rows.map(row => row.table))].sort()
}
