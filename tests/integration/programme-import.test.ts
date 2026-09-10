import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { LATECOMER_MAP, reconcile, transformProgramme } from '#migration/programme'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// Programme (K-113), proved against a source shaped like the real old proscenium schema and the
// real migrations this repo builds. The rehearsal against a production dump is the other half.

function oldEstate(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE venues (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, capacity INTEGER, description TEXT, is_external INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE seasons (id TEXT PRIMARY KEY, name TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE show_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE shows (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, description TEXT,
      long_description TEXT, external_url TEXT, category_id TEXT, season_id TEXT, age_guidance TEXT,
      latecomer_policy TEXT, content_warning_notes TEXT, warnings_confirmed_none INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE content_warnings (id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, category TEXT, description TEXT, icon TEXT, sort INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE show_content_warnings (id TEXT PRIMARY KEY, show_id TEXT NOT NULL, content_warning_id TEXT NOT NULL, level TEXT);
    CREATE TABLE performances (
      id TEXT PRIMARY KEY, show_id TEXT NOT NULL, venue_id TEXT NOT NULL, starts_at INTEGER NOT NULL,
      doors_at INTEGER, duration_minutes INTEGER, interval_count INTEGER NOT NULL DEFAULT 0,
      interval_minutes INTEGER, capacity_override INTEGER, booking_closes_hours_before INTEGER,
      external_booking_url TEXT, status TEXT NOT NULL, notes TEXT, created_at TEXT NOT NULL);
  `)
  return db
}

function seedHappyPath(db: Database): void {
  db.exec(`
    INSERT INTO venues (id, name, address, capacity, description, is_external) VALUES
      ('v-1', 'The Old House', '1 Example Street', 120, 'The main house.', 0);
    INSERT INTO seasons (id, name, starts_at, ends_at, sort, archived) VALUES
      ('s-1', '2023/24', ${Date.UTC(2023, 7, 1)}, ${Date.UTC(2024, 6, 31, 22, 59, 59)}, 0, 0);
    INSERT INTO show_categories (id, name, sort) VALUES ('c-1', 'In House', 0);
    INSERT INTO shows (id, slug, title, subtitle, description, long_description, external_url, category_id,
      season_id, age_guidance, latecomer_policy, content_warning_notes, warnings_confirmed_none, status, created_at, updated_at)
    VALUES ('sh-1', 'a-show', 'A Show', 'A subtitle', 'Description.', 'Long description.', NULL, 'c-1', 's-1',
      'Contains strobe lighting', 'INTERVAL_ONLY', 'Strobe in act two.', 1, 'PUBLISHED', '2023-09-01 12:00:00', '2023-09-02 12:00:00');
    INSERT INTO content_warnings (id, slug, title, kind, category, description, icon, sort, archived) VALUES
      ('cw-1', 'strobe-lighting', 'Strobe lighting', 'TECHNICAL', NULL, NULL, NULL, 0, 0);
    INSERT INTO show_content_warnings (id, show_id, content_warning_id, level) VALUES ('scw-1', 'sh-1', 'cw-1', NULL);
    INSERT INTO performances (id, show_id, venue_id, starts_at, doors_at, duration_minutes, interval_count,
      interval_minutes, capacity_override, booking_closes_hours_before, external_booking_url, status, notes, created_at)
    VALUES ('p-1', 'sh-1', 'v-1', ${Date.UTC(2024, 2, 4, 19, 30)}, ${Date.UTC(2024, 2, 4, 19)}, 120, 1, 15,
      100, 2, NULL, 'ON_SALE', 'Internal note.', '2023-09-01 12:00:00');
  `)
}

function freshMaps() {
  return {
    venueIds: new Map<string, string>(),
    seasonIds: new Map<string, string>(),
    categoryIds: new Map<string, string>(),
    showIds: new Map<string, string>(),
    warningIds: new Map<string, string>(),
    performanceIds: new Map<string, string>(),
  }
}

async function withTarget(fn: (target: TestDatabase) => void | Promise<void>): Promise<void> {
  const target = await createTestDatabase()
  try {
    await fn(target)
  }
  finally {
    target.close()
  }
}

describe('the happy path lands every table (K-113)', () => {
  test('venue, season, category, show, warning, link and performance all import with real values', async () => {
    const source = oldEstate()
    seedHappyPath(source)
    await withTarget(async (target) => {
      const { summary, exceptions } = transformProgramme({ source, ...freshMaps(), target: target.raw })

      expect(exceptions).toEqual([])
      expect(summary).toMatchObject({
        venues: 1, seasons: 1, categories: 1, shows: 1, contentWarnings: 1,
        showContentWarnings: 1, performances: 1, droppedExternalUrls: 0, narrowedLatecomerPolicies: 0,
      })

      const [venue] = rows<{ name: string, is_external: number, room_id: string | null }>(target, 'SELECT name, is_external, room_id FROM venues')
      expect(venue).toMatchObject({ name: 'The Old House', is_external: 0, room_id: null })

      const [season] = rows<{ starts_on: string, ends_on: string }>(target, 'SELECT starts_on, ends_on FROM seasons')
      expect(season).toMatchObject({ starts_on: '2023-08-01', ends_on: '2024-07-31' })

      const [show] = rows<{ title: string, latecomer_policy: string, content_notes: string }>(
        target, 'SELECT title, latecomer_policy, content_notes FROM shows')
      expect(show).toMatchObject({ title: 'A Show', latecomer_policy: 'AT_INTERVAL', content_notes: 'Strobe in act two.' })

      const [performance] = rows<{ starts_at: number, doors_at: number, notes: string }>(
        target, 'SELECT starts_at, doors_at, notes FROM performances')
      expect(performance).toMatchObject({ starts_at: Math.floor(Date.UTC(2024, 2, 4, 19, 30) / 1000), notes: 'Internal note.' })

      const check = reconcile(source, target.raw, summary)
      expect(check.ok).toBe(true)
    })
    source.close()
  })

  test('running it twice does not duplicate any row', async () => {
    const source = oldEstate()
    seedHappyPath(source)
    await withTarget(async (target) => {
      const maps = freshMaps()
      transformProgramme({ source, ...maps, target: target.raw })
      transformProgramme({ source, ...maps, target: target.raw })

      expect(rows(target, 'SELECT id FROM venues')).toHaveLength(1)
      expect(rows(target, 'SELECT id FROM shows')).toHaveLength(1)
      expect(rows(target, 'SELECT id FROM performances')).toHaveLength(1)
      expect(rows(target, 'SELECT id FROM show_content_warnings')).toHaveLength(1)
    })
    source.close()
  })
})

describe('a season boundary is read in London, not UTC', () => {
  test('the last instant of 31 July BST is still 31 July in London, not already 1 August', async () => {
    const source = oldEstate()
    source.exec(`
      INSERT INTO seasons (id, name, starts_at, ends_at, sort, archived) VALUES
        ('s-1', '2023/24', ${Date.UTC(2023, 7, 1)}, ${Date.UTC(2024, 6, 31, 22, 59, 59)}, 0, 0);
    `)
    await withTarget(async (target) => {
      transformProgramme({ source, ...freshMaps(), target: target.raw })
      const [season] = rows<{ ends_on: string }>(target, 'SELECT ends_on FROM seasons')
      expect(season!.ends_on).toBe('2024-07-31')
    })
    source.close()
  })
})

describe('an orphaned reference is an exception, never a guess (K-113 criterion 2)', () => {
  test('a show naming a category that never imported lands uncategorised, named in the exceptions', async () => {
    const source = oldEstate()
    source.exec(`
      INSERT INTO shows (id, slug, title, category_id, warnings_confirmed_none, status, created_at, updated_at)
      VALUES ('sh-orphan', 'orphan', 'Orphan', 'missing-category', 0, 'DRAFT', '2023-09-01 12:00:00', '2023-09-01 12:00:00');
    `)
    await withTarget(async (target) => {
      const { exceptions } = transformProgramme({ source, ...freshMaps(), target: target.raw })
      expect(exceptions.some(e => e.includes('sh-orphan') && e.includes('category'))).toBe(true)
      const [show] = rows<{ category_id: string | null }>(target, 'SELECT category_id FROM shows')
      expect(show!.category_id).toBeNull()
    })
    source.close()
  })

  test('a performance naming a show or venue that never imported is skipped, not written with a broken reference', async () => {
    const source = oldEstate()
    source.exec(`
      INSERT INTO performances (id, show_id, venue_id, starts_at, interval_count, status, created_at)
      VALUES ('p-orphan', 'missing-show', 'missing-venue', ${Date.UTC(2024, 2, 4, 19, 30)}, 0, 'ON_SALE', '2023-09-01 12:00:00');
    `)
    await withTarget(async (target) => {
      const { summary, exceptions } = transformProgramme({ source, ...freshMaps(), target: target.raw })
      expect(summary.performances).toBe(0)
      expect(exceptions.some(e => e.includes('p-orphan'))).toBe(true)
      expect(rows(target, 'SELECT id FROM performances')).toHaveLength(0)
    })
    source.close()
  })

  test('a warning link naming a show or warning that never imported is dropped, not written with a broken reference', async () => {
    const source = oldEstate()
    source.exec(`
      INSERT INTO shows (id, slug, title, warnings_confirmed_none, status, created_at, updated_at)
      VALUES ('sh-1', 'a-show', 'A Show', 0, 'DRAFT', '2023-09-01 12:00:00', '2023-09-01 12:00:00');
      INSERT INTO show_content_warnings (id, show_id, content_warning_id, level)
      VALUES ('scw-orphan', 'sh-1', 'missing-warning', NULL);
    `)
    await withTarget(async (target) => {
      const { exceptions } = transformProgramme({ source, ...freshMaps(), target: target.raw })
      expect(exceptions.some(e => e.includes('scw-orphan'))).toBe(true)
      expect(rows(target, 'SELECT id FROM show_content_warnings')).toHaveLength(0)
    })
    source.close()
  })
})

describe('the latecomer vocabulary narrows from four values to three', () => {
  test.each([
    ['SUITABLE_BREAK', 'ADMITTED', true],
    ['ANY_TIME', 'ADMITTED', true],
    ['INTERVAL_ONLY', 'AT_INTERVAL', false],
    ['NOT_ADMITTED', 'NOT_ADMITTED', false],
  ])('%s maps to %s', (old, expected) => {
    expect(LATECOMER_MAP[old]).toBe(expected)
  })

  test('a narrowed value (SUITABLE_BREAK or ANY_TIME) is counted, not silently collapsed', async () => {
    const source = oldEstate()
    source.exec(`
      INSERT INTO shows (id, slug, title, latecomer_policy, warnings_confirmed_none, status, created_at, updated_at)
      VALUES ('sh-1', 'a-show', 'A Show', 'SUITABLE_BREAK', 0, 'DRAFT', '2023-09-01 12:00:00', '2023-09-01 12:00:00');
    `)
    await withTarget(async (target) => {
      const { summary } = transformProgramme({ source, ...freshMaps(), target: target.raw })
      expect(summary.narrowedLatecomerPolicies).toBe(1)
    })
    source.close()
  })
})

describe('an external_url is dropped, not silently kept (no unified column for it)', () => {
  test('is counted rather than lost without a trace', async () => {
    const source = oldEstate()
    source.exec(`
      INSERT INTO shows (id, slug, title, external_url, warnings_confirmed_none, status, created_at, updated_at)
      VALUES ('sh-1', 'a-show', 'A Show', 'https://example.invalid/tickets', 0, 'DRAFT', '2023-09-01 12:00:00', '2023-09-01 12:00:00');
    `)
    await withTarget(async (target) => {
      const { summary } = transformProgramme({ source, ...freshMaps(), target: target.raw })
      expect(summary.droppedExternalUrls).toBe(1)
    })
    source.close()
  })
})
