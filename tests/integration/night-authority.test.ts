import { describe, expect, test } from 'bun:test'
import { OFFICER_BYPASS_ACTION, officerBypassEntry, officerBypassTarget } from '#shared/utils/night-authority'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { AuditRow } from '#shared/utils/audit'

// "Once per account per night per venue per role" on the real migrations (0044). A claim about
// concurrency is only true where the database refuses the second write.

const NIGHT = '2026-10-17'
const VENUE = 'venue-a'
const OFFICER = 'officer-1'

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const INSERT = 'INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)'
const TOLERANT = `${INSERT} ON CONFLICT DO NOTHING`

function write(database: TestDatabase, entry: AuditRow, statement = TOLERANT): void {
  database.batch([[statement, entry.id, entry.actorId, entry.action, entry.target, JSON.stringify(entry.detail)]])
}

const bypasses = (database: TestDatabase): { target: string, detail: string }[] =>
  rows(database, 'SELECT target, detail FROM audit_log WHERE action = ? ORDER BY target', OFFICER_BYPASS_ACTION)

describe('the bypass is recorded once a night, and the database is what holds that', () => {
  test('a second resolution for the same night, venue and role adds no row', async () => {
    await withDatabase((database) => {
      write(database, officerBypassEntry(OFFICER, NIGHT, VENUE, 'DOOR', ['performance-a']))
      write(database, officerBypassEntry(OFFICER, NIGHT, VENUE, 'DOOR', ['performance-a']))
      expect(bypasses(database).length).toBe(1)
    })
  })

  // Without ON CONFLICT the index refuses outright, which is what proves the index is there and
  // not merely that the tolerant statement did nothing.
  test('the index refuses the second row rather than the statement declining to write it', async () => {
    await withDatabase((database) => {
      write(database, officerBypassEntry(OFFICER, NIGHT, VENUE, 'DOOR', ['performance-a']), INSERT)
      expect(() => write(database, officerBypassEntry(OFFICER, NIGHT, VENUE, 'DOOR', ['performance-a']), INSERT))
        .toThrow(/UNIQUE/)
    })
  })

  test('a second venue on the same night is its own row', async () => {
    await withDatabase((database) => {
      write(database, officerBypassEntry(OFFICER, NIGHT, VENUE, 'DOOR', ['performance-a']))
      write(database, officerBypassEntry(OFFICER, NIGHT, 'venue-b', 'DOOR', ['performance-b']))
      expect(bypasses(database).map(row => row.target)).toEqual([
        officerBypassTarget(NIGHT, VENUE, 'DOOR'),
        officerBypassTarget(NIGHT, 'venue-b', 'DOOR'),
      ])
    })
  })

  test('a second role, a second night and a second officer are each their own row', async () => {
    await withDatabase((database) => {
      write(database, officerBypassEntry(OFFICER, NIGHT, VENUE, 'DOOR', ['performance-a']))
      write(database, officerBypassEntry(OFFICER, NIGHT, VENUE, 'BAR', ['performance-a']))
      write(database, officerBypassEntry(OFFICER, '2026-10-18', VENUE, 'DOOR', ['performance-c']))
      write(database, officerBypassEntry('officer-2', NIGHT, VENUE, 'DOOR', ['performance-a']))
      expect(bypasses(database).length).toBe(4)
    })
  })

  // The index is partial, so it must not touch anything else the trail records.
  test('another action may repeat the same target freely', async () => {
    await withDatabase((database) => {
      const target = officerBypassTarget(NIGHT, VENUE, 'DOOR')
      for (const id of ['one', 'two']) {
        database.batch([[INSERT, id, OFFICER, 'session.started', target, null]])
      }
      expect(rows(database, 'SELECT id FROM audit_log WHERE action = ?', 'session.started').length).toBe(2)
    })
  })

  test('the row carries every performance the venue ran, not only the one asked for', async () => {
    await withDatabase((database) => {
      write(database, officerBypassEntry(OFFICER, NIGHT, VENUE, 'DUTY_MANAGER', ['matinee', 'evening']))
      const detail = JSON.parse(bypasses(database)[0]!.detail) as { performanceIds: string[], venueId: string }
      expect(detail.performanceIds).toEqual(['matinee', 'evening'])
      expect(detail.venueId).toBe(VENUE)
    })
  })

  // Append-only is a trigger, and an index added beside it must not have disturbed either (0010).
  test('the trail still refuses an update and a delete', async () => {
    await withDatabase((database) => {
      write(database, officerBypassEntry(OFFICER, NIGHT, VENUE, 'DOOR', ['performance-a']))
      expect(() => database.batch([['UPDATE audit_log SET action = ? WHERE actor_id = ?', 'role.granted', OFFICER]])).toThrow()
      expect(() => database.batch([['DELETE FROM audit_log WHERE actor_id = ?', OFFICER]])).toThrow()
    })
  })
})
