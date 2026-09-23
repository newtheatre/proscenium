import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { CONFIG_KEY_NAMES } from '#shared/utils/config'

// 0087: the whole-year boundary keys are renamed, and a committee's stored value moves with them.

const names: string[] = CONFIG_KEY_NAMES
const MIGRATIONS_DIR = 'server/db/migrations/sqlite'
const RENAME_TAG = '0114_the_year_boundary_is_named_year'

async function journalTags(): Promise<string[]> {
  const journal = await Bun.file(join(MIGRATIONS_DIR, 'meta', '_journal.json')).json() as { entries: { tag: string }[] }
  return journal.entries.map(entry => entry.tag)
}

function execMigration(raw: Database, sql: string): void {
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()
    if (trimmed) raw.exec(trimmed)
  }
}

async function scratchDatabaseBeforeRename(): Promise<Database> {
  const raw = new Database(':memory:')
  raw.exec('PRAGMA foreign_keys = ON;')
  const tags = await journalTags()
  const cutoff = tags.indexOf(RENAME_TAG)
  if (cutoff === -1) throw new Error(`${RENAME_TAG} is not in the journal; has it been renumbered?`)
  for (const tag of tags.slice(0, cutoff)) {
    execMigration(raw, await Bun.file(join(MIGRATIONS_DIR, `${tag}.sql`)).text())
  }
  return raw
}

describe('the year boundary keys are named YEAR_START and YEAR_END (0087)', () => {
  test('the registry knows the year keys and no longer knows the season ones', () => {
    expect(names).toEqual(expect.arrayContaining(['YEAR_START', 'YEAR_END']))
    expect(names).not.toContain('SEASON_START')
    expect(names).not.toContain('SEASON_END')
  })

  test('a stored value keeps its value and its time under the new key', async () => {
    const raw = await scratchDatabaseBeforeRename()
    try {
      raw.exec(`INSERT INTO config (key, value, updated_by, updated_at) VALUES ('SEASON_START', '"09-01"', NULL, 1700000000)`)
      raw.exec(`INSERT INTO config (key, value, updated_by, updated_at) VALUES ('SEASON_END', '"08-31"', NULL, 1700000001)`)
      raw.exec(`INSERT INTO config (key, value, updated_by, updated_at) VALUES ('BAR_TAB_CAP_PENCE', '2000', NULL, 1700000002)`)

      execMigration(raw, await Bun.file(join(MIGRATIONS_DIR, `${RENAME_TAG}.sql`)).text())

      const stored = raw.query('SELECT key, value, updated_at AS updatedAt FROM config ORDER BY key').all()
      expect(stored).toEqual([
        { key: 'BAR_TAB_CAP_PENCE', value: '2000', updatedAt: 1700000002 },
        { key: 'YEAR_END', value: '"08-31"', updatedAt: 1700000001 },
        { key: 'YEAR_START', value: '"09-01"', updatedAt: 1700000000 },
      ])
    }
    finally {
      raw.close()
    }
  })

  test('a database that never stored either key is left as it was', async () => {
    const raw = await scratchDatabaseBeforeRename()
    try {
      execMigration(raw, await Bun.file(join(MIGRATIONS_DIR, `${RENAME_TAG}.sql`)).text())
      expect(raw.query('SELECT count(*) AS total FROM config').get()).toEqual({ total: 0 })
    }
    finally {
      raw.close()
    }
  })
})
