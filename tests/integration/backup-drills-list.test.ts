import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { schema } from '@nuxthub/db'
import { backupDrillsList } from '#shared/utils/backup-drills-list'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { tableColumns, whereFrom } from '#server/utils/list-filters'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// The restore drill log through its declaration (K-129): search only, no filterable field yet.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function person(database: TestDatabase, id: string, name: string): void {
  database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', id, `${id}@example.invalid`, name]])
}

function drill(database: TestDatabase, id: string, operatorId: string, ranAt: string, notes: string | null): void {
  database.batch([[
    `INSERT INTO backup_drills (id, ran_on, operator_id, outcome, time_to_restore_minutes, row_counts_match, money_totals_match, notes)
     VALUES (?, ?, ?, 'PASS', 30, 1, 1, ?)`,
    id, ranAt, operatorId, notes,
  ]])
}

const parsed = (query: Record<string, string>) => {
  const result = filterQuerySchema(backupDrillsList).safeParse(query)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

function drillColumn(name: string) {
  if (name === 'rowid') return sql`${schema.backupDrills}.rowid`
  return tableColumns(schema.backupDrills)(name)
}

function ids(database: TestDatabase, query: Record<string, string>): string[] {
  const clause = whereFrom(backupDrillsList, parsed(query), {
    column: drillColumn,
    search: [schema.users.name, schema.backupDrills.notes],
  })
  const statement = sql`SELECT backup_drills.id AS id FROM backup_drills
    JOIN users ON users.id = backup_drills.operator_id
    ${clause.where ? sql`WHERE ${clause.where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string }>(database, text, ...parameters).map(row => row.id)
}

describe('the drill log has no declared filter, only search and a recorded-order tiebreak', () => {
  test('search reaches the operator name and the note', async () => {
    await withDatabase((database) => {
      person(database, 'op-ada', 'Ada Admin')
      person(database, 'op-tom', 'Tom Treasurer')
      drill(database, 'd-1', 'op-ada', '2026-09-01', 'All green')
      drill(database, 'd-2', 'op-tom', '2026-09-05', 'Row counts off by one')

      expect(ids(database, { search: 'ada' })).toEqual(['d-1'])
      expect(ids(database, { search: 'row counts' })).toEqual(['d-2'])
      expect(ids(database, { search: 'nobody' })).toEqual([])
    })
  })

  test('the default sort is by the day run, newest first, and a same-day tie breaks on recorded order', async () => {
    await withDatabase((database) => {
      person(database, 'op-ada', 'Ada Admin')
      drill(database, 'd-1', 'op-ada', '2026-09-01', null)
      drill(database, 'd-2', 'op-ada', '2026-09-05', null)
      drill(database, 'd-3', 'op-ada', '2026-09-05', null)

      expect(ids(database, {})).toEqual(['d-2', 'd-3', 'd-1'])
    })
  })

  test('sorting is by a declared field only', () => {
    expect(filterQuerySchema(backupDrillsList).safeParse({ sort: 'notes' }).success).toBe(false)
  })
})
