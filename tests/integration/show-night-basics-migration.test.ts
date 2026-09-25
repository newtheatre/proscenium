import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { join } from 'node:path'

// Issue 1318: a data migration gives every venue we run the two system-verified checklist items
// (E-114 criterion 3) and the board its four routine calls (E-121 criterion 2), against a scratch
// database at the shape it meets. Found by name, so a renumbering on rebase does not break it.

const MIGRATIONS_DIR = 'server/db/migrations/sqlite'
const NAME = '_the_show_night_basics_are_seeded'

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

async function tagOf(): Promise<string> {
  const tag = (await journalTags()).find(one => one.endsWith(NAME))
  if (!tag) throw new Error(`no migration ending ${NAME} is in the journal`)
  return tag
}

async function databaseBefore(): Promise<Database> {
  const raw = new Database(':memory:')
  raw.exec('PRAGMA foreign_keys = ON;')
  const tags = await journalTags()
  const cutoff = tags.indexOf(await tagOf())
  for (const tag of tags.slice(0, cutoff)) {
    execMigration(raw, await Bun.file(join(MIGRATIONS_DIR, `${tag}.sql`)).text())
  }
  return raw
}

async function migrate(raw: Database): Promise<void> {
  execMigration(raw, await Bun.file(join(MIGRATIONS_DIR, `${await tagOf()}.sql`)).text())
}

async function withMigrated(seed: (raw: Database) => void, check: (raw: Database) => void, runs = 1): Promise<void> {
  const raw = await databaseBefore()
  try {
    seed(raw)
    for (let run = 0; run < runs; run++) await migrate(raw)
    check(raw)
  }
  finally {
    raw.close()
  }
}

function venue(raw: Database, id: string, options: { external?: boolean, archived?: boolean } = {}): void {
  raw.query('INSERT INTO venues (id, name, is_external, archived) VALUES (?, ?, ?, ?)')
    .run(id, `Venue ${id}`, options.external ? 1 : 0, options.archived ? 1 : 0)
}

function item(raw: Database, id: string, venueId: string, phase: string, sort: number, systemCheck: string | null, active = true): void {
  raw.query('INSERT INTO checklist_items (id, venue_id, phase, label, sort, required, system_check, active) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
    .run(id, venueId, phase, `Item ${id}`, sort, systemCheck, active ? 1 : 0)
}

interface ItemRow { phase: string, label: string, sort: number, required: number, systemCheck: string | null, active: number, updatedBy: string | null }

function systemItems(raw: Database, venueId: string): ItemRow[] {
  return raw.query(`
    SELECT phase, label, sort, required, system_check AS systemCheck, active, updated_by AS updatedBy
    FROM checklist_items WHERE venue_id = ? AND system_check IS NOT NULL ORDER BY sort
  `).all(venueId) as ItemRow[]
}

interface PresetRow { label: string, body: string, sort: number, active: number }

function presets(raw: Database): PresetRow[] {
  return raw.query('SELECT label, body, sort, active FROM backstage_presets ORDER BY sort, label').all() as PresetRow[]
}

function audited(raw: Database, action: string): { target: string, detail: string, actorId: string | null }[] {
  return raw.query('SELECT target, detail, actor_id AS actorId FROM audit_log WHERE action = ? ORDER BY target, detail')
    .all(action) as { target: string, detail: string, actorId: string | null }[]
}

describe('every venue we run gains the two system-verified items (E-114 criterion 3)', () => {
  test('a venue we run gets both, post-show and required, made by no person', async () => {
    await withMigrated(raw => venue(raw, 'house'), (raw) => {
      expect(systemItems(raw, 'house')).toEqual([
        { phase: 'POST', label: 'No-show holds released', sort: 0, required: 1, systemCheck: 'NO_SHOW_HOLDS_RELEASED', active: 1, updatedBy: null },
        { phase: 'POST', label: 'Tonight\'s incidents reviewed', sort: 1, required: 1, systemCheck: 'INCIDENTS_REVIEWED', active: 1, updatedBy: null },
      ])
    })
  })

  test('an external venue and a retired one gain nothing', async () => {
    await withMigrated((raw) => {
      venue(raw, 'hired', { external: true })
      venue(raw, 'gone', { archived: true })
    }, (raw) => {
      expect(systemItems(raw, 'hired')).toEqual([])
      expect(systemItems(raw, 'gone')).toEqual([])
    })
  })

  test('a venue already carrying one keeps it and gains only the other, listed after its own items', async () => {
    await withMigrated((raw) => {
      venue(raw, 'house')
      item(raw, 'exits', 'house', 'PRE', 4, null)
      item(raw, 'holds', 'house', 'POST', 7, 'NO_SHOW_HOLDS_RELEASED')
    }, (raw) => {
      expect(systemItems(raw, 'house').map(row => [row.systemCheck, row.sort, row.label])).toEqual([
        ['NO_SHOW_HOLDS_RELEASED', 7, 'Item holds'],
        ['INCIDENTS_REVIEWED', 8, 'Tonight\'s incidents reviewed'],
      ])
    })
  })

  test('a check the committee retired stays retired rather than coming back', async () => {
    await withMigrated((raw) => {
      venue(raw, 'house')
      item(raw, 'incidents', 'house', 'POST', 0, 'INCIDENTS_REVIEWED', false)
    }, (raw) => {
      const rows = systemItems(raw, 'house').filter(row => row.systemCheck === 'INCIDENTS_REVIEWED')
      expect(rows.map(row => row.active)).toEqual([0])
    })
  })

  test('each addition is audited as the checklist screen audits one, naming no person (0011)', async () => {
    await withMigrated(raw => venue(raw, 'house'), (raw) => {
      const rows = audited(raw, 'checklist-item.created')
      expect(rows.map(row => [row.target, JSON.parse(row.detail), row.actorId])).toEqual([
        ['venue:house', { phase: 'POST', label: 'No-show holds released' }, null],
        ['venue:house', { phase: 'POST', label: 'Tonight\'s incidents reviewed' }, null],
      ])
    })
  })
})

describe('the board gains its four routine calls (E-121 criterion 2)', () => {
  test('an empty preset list gets Standby, Hold, Clear and Ambulance, in that order', async () => {
    await withMigrated(() => {}, (raw) => {
      expect(presets(raw).map(row => [row.label, row.sort, row.active])).toEqual([
        ['Standby', 0, 1],
        ['Hold', 1, 1],
        ['Clear', 2, 1],
        ['Ambulance', 3, 1],
      ])
      expect(presets(raw).find(row => row.label === 'Ambulance')?.body).toContain('Duty manager to the foyer')
      expect(audited(raw, 'backstage-preset.created')).toHaveLength(4)
    })
  })

  test('a call the committee already has, whatever its case, is not added twice', async () => {
    await withMigrated((raw) => {
      raw.query('INSERT INTO backstage_presets (id, label, body, sort) VALUES (?, ?, ?, ?)').run('mine', 'hold', 'Hold please', 5)
    }, (raw) => {
      expect(presets(raw).map(row => [row.label, row.sort])).toEqual([
        ['hold', 5],
        ['Standby', 6],
        ['Clear', 7],
        ['Ambulance', 8],
      ])
      expect(audited(raw, 'backstage-preset.created')).toHaveLength(3)
    })
  })
})

describe('running it again adds nothing', () => {
  test('a second run leaves the items, the presets and the audit trail as they were', async () => {
    await withMigrated(raw => venue(raw, 'house'), (raw) => {
      expect(systemItems(raw, 'house')).toHaveLength(2)
      expect(presets(raw)).toHaveLength(4)
      expect(audited(raw, 'checklist-item.created')).toHaveLength(2)
      expect(audited(raw, 'backstage-preset.created')).toHaveLength(4)
    }, 2)
  })
})
