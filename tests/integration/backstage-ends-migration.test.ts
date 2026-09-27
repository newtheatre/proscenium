import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { migrationTags } from '#migration/schema'
import { applyMigration, applyMigrations } from '#tests/helpers/database'

// Issue 1313's data step against a scratch database at the shape it meets: calls the committee
// already made, in any case, are placed by what they say. Found by name, not number.

const NAME = '_each_board_call_belongs_to_one_end'

async function tagOf(): Promise<string> {
  const tag = (await migrationTags()).find(one => one.endsWith(NAME))
  if (!tag) throw new Error(`no migration ending ${NAME} is in the journal`)
  return tag
}

async function withMigrated(seed: (raw: Database) => void, check: (raw: Database) => void): Promise<void> {
  const raw = new Database(':memory:')
  raw.exec('PRAGMA foreign_keys = ON;')
  try {
    const tag = await tagOf()
    await applyMigrations(raw, tag)
    seed(raw)
    await applyMigration(raw, tag)
    check(raw)
  }
  finally {
    raw.close()
  }
}

const sideOf = (raw: Database, table: string, id: string): string | null =>
  (raw.query(`SELECT side FROM ${table} WHERE id = ?`).get(id) as { side: string | null }).side

describe('the calls already on the board are placed on their own end (issue 1313)', () => {
  test('a Ready to restart the committee already made is front of house\'s, and no second is added', async () => {
    await withMigrated((raw) => {
      raw.query('INSERT INTO backstage_milestone_types (id, label, sort) VALUES (?, ?, ?)').run('mt-ready', 'ready to restart', 9)
    }, (raw) => {
      expect(sideOf(raw, 'backstage_milestone_types', 'mt-ready')).toBe('FOH')
      const count = raw.query('SELECT count(*) AS n FROM backstage_milestone_types WHERE label = ? COLLATE NOCASE').get('Ready to restart') as { n: number }
      expect(count.n).toBe(1)
    })
  })

  test('a preset in another case is placed by its wording all the same', async () => {
    await withMigrated((raw) => {
      raw.query('DELETE FROM backstage_presets').run()
      raw.query('INSERT INTO backstage_presets (id, label, body, sort) VALUES (?, ?, ?, ?)').run('p-standby', 'standby', 'Standby please.', 0)
      raw.query('INSERT INTO backstage_presets (id, label, body, sort) VALUES (?, ?, ?, ?)').run('p-ambulance', 'AMBULANCE', 'An ambulance has been called.', 1)
      raw.query('INSERT INTO backstage_presets (id, label, body, sort) VALUES (?, ?, ?, ?)').run('p-own', 'Beginners', 'Beginners please.', 2)
    }, (raw) => {
      expect(sideOf(raw, 'backstage_presets', 'p-standby')).toBe('FOH')
      expect(sideOf(raw, 'backstage_presets', 'p-ambulance')).toBe('BACKSTAGE')
      expect(sideOf(raw, 'backstage_presets', 'p-own')).toBeNull()
    })
  })
})
