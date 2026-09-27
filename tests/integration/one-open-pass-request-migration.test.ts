import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { migrationTags } from '#migration/schema'
import { applyMigration, applyMigrations } from '#tests/helpers/database'

// Issue 1331's data step against a scratch database at the shape it meets: a member who asked twice
// asked once, so the oldest open request per member and type stays. Found by name, not number.

const NAME = '_a_member_holds_one_open_pass_request_per_type'

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

function people(raw: Database): void {
  for (const id of ['u-1', 'u-2']) {
    raw.query('INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)').run(id, `${id}@example.invalid`, id)
  }
  for (const id of ['pt-1', 'pt-2']) {
    raw.query('INSERT INTO pass_types (id, slug, name, valid_from, valid_until) VALUES (?, ?, ?, ?, ?)').run(id, id, id, 1_000, 2_000)
  }
  raw.query('INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, ?)').run('price-1', 'pt-1', 'Standard', 2500)
  raw.query('INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid) VALUES (?, ?, ?, ?, ?, ?)')
    .run('pass-1', 'PASS01', 'pt-1', 'price-1', 'u-1', 2500)
}

function request(raw: Database, id: string, userId: string, passTypeId: string, createdAt: number, status = 'PENDING', passId: string | null = null): void {
  raw.query('INSERT INTO pass_requests (id, pass_type_id, user_id, status, pass_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, passTypeId, userId, status, passId, createdAt)
}

const rows = (raw: Database): { id: string, status: string }[] =>
  raw.query('SELECT id, status FROM pass_requests ORDER BY id').all() as { id: string, status: string }[]

describe('each member keeps one open request per pass type (issue 1331)', () => {
  test('the oldest open request stays, the newer duplicates go, and everything else is untouched', async () => {
    await withMigrated((raw) => {
      people(raw)
      request(raw, 'r-a-oldest', 'u-1', 'pt-1', 100)
      request(raw, 'r-b-newer', 'u-1', 'pt-1', 200)
      request(raw, 'r-c-newest', 'u-1', 'pt-1', 300)
      request(raw, 'r-d-other-type', 'u-1', 'pt-2', 400)
      request(raw, 'r-e-other-member', 'u-2', 'pt-1', 500)
      request(raw, 'r-f-expired', 'u-1', 'pt-1', 50, 'EXPIRED')
      request(raw, 'r-g-fulfilled', 'u-1', 'pt-1', 60, 'FULFILLED', 'pass-1')
    }, (raw) => {
      expect(rows(raw)).toEqual([
        { id: 'r-a-oldest', status: 'PENDING' },
        { id: 'r-d-other-type', status: 'PENDING' },
        { id: 'r-e-other-member', status: 'PENDING' },
        { id: 'r-f-expired', status: 'EXPIRED' },
        { id: 'r-g-fulfilled', status: 'FULFILLED' },
      ])
    })
  })

  test('two open requests made in the same second keep the lower id', async () => {
    await withMigrated((raw) => {
      people(raw)
      request(raw, 'r-2', 'u-2', 'pt-2', 700)
      request(raw, 'r-1', 'u-2', 'pt-2', 700)
    }, (raw) => {
      expect(rows(raw)).toEqual([{ id: 'r-1', status: 'PENDING' }])
    })
  })

  test('the index is built: a second open request for a survivor is refused', async () => {
    await withMigrated((raw) => {
      people(raw)
      request(raw, 'r-1', 'u-1', 'pt-1', 100)
      request(raw, 'r-2', 'u-1', 'pt-1', 200)
    }, (raw) => {
      expect(() => request(raw, 'r-3', 'u-1', 'pt-1', 300)).toThrow()
      expect(() => request(raw, 'r-4', 'u-1', 'pt-1', 300, 'EXPIRED')).not.toThrow()
    })
  })
})
