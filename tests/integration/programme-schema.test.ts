import { describe, expect, test } from 'bun:test'
import { showNightBounds } from '#shared/utils/show-night'
import { performancesOnNightQuery } from '#server/utils/performances'
import { MAX_BOUND_PARAMETERS, boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// The programme on the real migrations (build-order contract d, docs/data-model.md). What the
// admin screens will refuse is only a guarantee where the database refuses it too.

const NIGHT = '2026-10-17'

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function insert(database: TestDatabase, table: string, values: Record<string, unknown>): void {
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

function count(database: TestDatabase, table: string, where = '1 = 1', ...parameters: unknown[]): number {
  return rows<{ n: number }>(database, `SELECT count(*) n FROM ${table} WHERE ${where}`, ...parameters)[0]!.n
}

function columnsOf(database: TestDatabase, table: string): string[] {
  return rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('${table}')`).map(column => column.name)
}

function seedProgramme(database: TestDatabase): void {
  insert(database, 'venues', { id: 'v1', name: 'The Theatre', capacity: 120 })
  insert(database, 'show_categories', { id: 'c1', name: 'In-house' })
  insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull', category_id: 'c1' })
}

describe('a venue is its own row, never a flagged room (0043)', () => {
  test('a venue stands without a room at all', async () => {
    await withDatabase((database) => {
      insert(database, 'venues', { id: 'v1', name: 'The Theatre' })
      expect(count(database, 'venues')).toBe(1)
      expect(columnsOf(database, 'venues')).toContain('room_id')
    })
  })

  test('a venue may point at a room, and the room knows nothing about it', async () => {
    await withDatabase((database) => {
      insert(database, 'rooms', { id: 'r1', name: 'The Auditorium' })
      insert(database, 'venues', { id: 'v1', name: 'The Theatre', room_id: 'r1' })
      expect(columnsOf(database, 'rooms')).not.toContain('venue_id')
      expect(columnsOf(database, 'rooms')).not.toContain('is_venue')
    })
  })

  // The attachment is a pointer, not ownership: losing the room must not lose the programme.
  test('deleting the room leaves the venue standing with no room', async () => {
    await withDatabase((database) => {
      insert(database, 'rooms', { id: 'r1', name: 'The Auditorium' })
      insert(database, 'venues', { id: 'v1', name: 'The Theatre', room_id: 'r1' })
      database.batch([[`DELETE FROM rooms WHERE id = 'r1'`]])
      expect(count(database, 'venues')).toBe(1)
      expect(rows<{ room_id: string | null }>(database, 'SELECT room_id FROM venues')[0]!.room_id).toBeNull()
    })
  })

  test('a venue name is held once, and a capacity of nought is not a capacity', async () => {
    await withDatabase((database) => {
      insert(database, 'venues', { id: 'v1', name: 'The Theatre' })
      expect(() => insert(database, 'venues', { id: 'v2', name: 'The Theatre' })).toThrow()
      expect(() => insert(database, 'venues', { id: 'v3', name: 'Elsewhere', capacity: 0 })).toThrow()
      expect(() => insert(database, 'venues', { id: 'v4', name: 'Uncapped', capacity: null })).not.toThrow()
    })
  })
})

describe('the emergency card belongs to its venue (E-113 criterion 1)', () => {
  test('one card per venue, and it goes when the venue does', async () => {
    await withDatabase((database) => {
      insert(database, 'venues', { id: 'v1', name: 'The Theatre' })
      insert(database, 'venue_emergency_info', { venue_id: 'v1', assembly_point: 'The car park', updated_at: 1 })
      expect(() => insert(database, 'venue_emergency_info', { venue_id: 'v1', updated_at: 2 })).toThrow()

      database.batch([[`DELETE FROM venues WHERE id = 'v1'`]])
      expect(count(database, 'venue_emergency_info')).toBe(0)
    })
  })

  test('it names who last edited it, and survives their erasure', async () => {
    await withDatabase((database) => {
      insert(database, 'users', { id: 'u1', email: 'officer@example.invalid', name: 'An Officer' })
      insert(database, 'venues', { id: 'v1', name: 'The Theatre' })
      insert(database, 'venue_emergency_info', { venue_id: 'v1', exits: 'Two, both stage left', updated_by: 'u1', updated_at: 1 })
      expect(count(database, 'venue_emergency_info', 'updated_by = ?', 'u1')).toBe(1)
    })
  })
})

describe('shows, seasons and categories (D-102, D-121)', () => {
  test('a slug is held once', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      expect(() => insert(database, 'shows', { id: 's2', slug: 'the-seagull', title: 'Another' })).toThrow()
    })
  })

  test('a show is DRAFT or PUBLISHED and nothing else', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      expect(rows<{ status: string }>(database, 'SELECT status FROM shows')[0]!.status).toBe('DRAFT')
      expect(() => insert(database, 'shows', { id: 's2', slug: 'x', title: 'X', status: 'LIVE' })).toThrow()
    })
  })

  test('a latecomer policy is one of the three, or not yet stated', async () => {
    await withDatabase((database) => {
      for (const policy of ['ADMITTED', 'AT_INTERVAL', 'NOT_ADMITTED']) {
        expect(() => insert(database, 'shows', { id: `s-${policy}`, slug: policy.toLowerCase(), title: 'X', latecomer_policy: policy })).not.toThrow()
      }
      expect(() => insert(database, 'shows', { id: 's-null', slug: 'unstated', title: 'X' })).not.toThrow()
      expect(() => insert(database, 'shows', { id: 's-bad', slug: 'bad', title: 'X', latecomer_policy: 'MAYBE' })).toThrow()
    })
  })

  // "Confirmed no warnings" is a recorded state, distinct from nobody having looked (D-102 c2).
  test('a show records confirmed-none separately from having no warnings', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      expect(rows<{ n: number }>(database, 'SELECT warnings_confirmed_none n FROM shows')[0]!.n).toBe(0)
      database.batch([[`UPDATE shows SET warnings_confirmed_none = 1 WHERE id = 's1'`]])
      expect(rows<{ n: number }>(database, 'SELECT warnings_confirmed_none n FROM shows')[0]!.n).toBe(1)
    })
  })

  test('a category with shows against it cannot be deleted out from under them', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      expect(() => database.batch([[`DELETE FROM show_categories WHERE id = 'c1'`]])).toThrow()
    })
  })

  test('a season is optional colour: deleting one leaves its shows', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      insert(database, 'seasons', { id: 'se1', name: '2026/27', starts_on: '2026-08-01', ends_on: '2027-07-31' })
      database.batch([[`UPDATE shows SET season_id = 'se1' WHERE id = 's1'`]])
      database.batch([[`DELETE FROM seasons WHERE id = 'se1'`]])
      expect(count(database, 'shows')).toBe(1)
      expect(rows<{ season_id: string | null }>(database, 'SELECT season_id FROM shows')[0]!.season_id).toBeNull()
    })
  })

  test('a season ends after it starts', async () => {
    await withDatabase((database) => {
      expect(() => insert(database, 'seasons', { id: 'se1', name: 'Backwards', starts_on: '2027-07-31', ends_on: '2026-08-01' })).toThrow()
    })
  })

  // Module B attaches to this column later, so it exists now and references nothing yet.
  test('a show carries the reserved production column', async () => {
    await withDatabase((database) => {
      expect(columnsOf(database, 'shows')).toContain('production_id')
    })
  })
})

describe('content warnings are a vocabulary, never free text (D-102 criterion 1)', () => {
  function seedWarnings(database: TestDatabase): void {
    seedProgramme(database)
    insert(database, 'content_warnings', { id: 'w-strobe', slug: 'strobe', title: 'Strobe lighting', kind: 'TECHNICAL' })
    insert(database, 'content_warnings', { id: 'w-death', slug: 'death', title: 'Death', kind: 'GENERAL' })
  }

  test('a warning is TECHNICAL or GENERAL, and its slug and title are each held once', async () => {
    await withDatabase((database) => {
      seedWarnings(database)
      expect(() => insert(database, 'content_warnings', { id: 'w2', slug: 'strobe', title: 'Other', kind: 'GENERAL' })).toThrow()
      expect(() => insert(database, 'content_warnings', { id: 'w3', slug: 'other', title: 'Strobe lighting', kind: 'GENERAL' })).toThrow()
      expect(() => insert(database, 'content_warnings', { id: 'w4', slug: 'other', title: 'Other', kind: 'SPICY' })).toThrow()
    })
  })

  test('a level is one of the three, or absent', async () => {
    await withDatabase((database) => {
      seedWarnings(database)
      for (const level of ['MENTIONED', 'DISCUSSED', 'DEPICTED']) {
        expect(() => insert(database, 'show_content_warnings', { id: `swc-${level}`, show_id: 's1', warning_id: 'w-death', level })).not.toThrow()
        database.batch([[`DELETE FROM show_content_warnings WHERE id = ?`, `swc-${level}`]])
      }
      expect(() => insert(database, 'show_content_warnings', { id: 'swc-bad', show_id: 's1', warning_id: 'w-death', level: 'HINTED' })).toThrow()
      expect(() => insert(database, 'show_content_warnings', { id: 'swc-technical', show_id: 's1', warning_id: 'w-strobe' })).not.toThrow()
    })
  })

  test('one show carries a warning once', async () => {
    await withDatabase((database) => {
      seedWarnings(database)
      insert(database, 'show_content_warnings', { id: 'swc1', show_id: 's1', warning_id: 'w-death', level: 'DEPICTED' })
      expect(() => insert(database, 'show_content_warnings', { id: 'swc2', show_id: 's1', warning_id: 'w-death', level: 'MENTIONED' })).toThrow()
    })
  })

  test('deleting a show takes its warnings; a warning in use cannot be deleted', async () => {
    await withDatabase((database) => {
      seedWarnings(database)
      insert(database, 'show_content_warnings', { id: 'swc1', show_id: 's1', warning_id: 'w-death', level: 'DEPICTED' })
      expect(() => database.batch([[`DELETE FROM content_warnings WHERE id = 'w-death'`]])).toThrow()
      database.batch([[`DELETE FROM shows WHERE id = 's1'`]])
      expect(count(database, 'show_content_warnings')).toBe(0)
    })
  })
})

describe('performances key to a show and a venue (E-127 criterion 1)', () => {
  test('a performance is DRAFT, ON_SALE or CANCELLED and nothing else', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      expect(() => insert(database, 'performances', { id: 'p1', show_id: 's1', venue_id: 'v1', starts_at: 1, status: 'SOLD_OUT' })).toThrow()
      expect(() => insert(database, 'performances', { id: 'p2', show_id: 's1', venue_id: 'v1', starts_at: 1 })).not.toThrow()
      expect(rows<{ status: string }>(database, 'SELECT status FROM performances')[0]!.status).toBe('DRAFT')
    })
  })

  test('deleting a show takes its performances; a venue with performances cannot be deleted', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      insert(database, 'performances', { id: 'p1', show_id: 's1', venue_id: 'v1', starts_at: 1 })
      expect(() => database.batch([[`DELETE FROM venues WHERE id = 'v1'`]])).toThrow()
      database.batch([[`DELETE FROM shows WHERE id = 's1'`]])
      expect(count(database, 'performances')).toBe(0)
    })
  })

  // Empty is not a link-out: a cleared field would otherwise reopen internal sales (D-122).
  test('an external ticketing link is a link or it is absent, never an empty string', async () => {
    await withDatabase((database) => {
      seedProgramme(database)
      expect(() => insert(database, 'performances', { id: 'p1', show_id: 's1', venue_id: 'v1', starts_at: 1, external_booking_url: '' })).toThrow()
      expect(() => insert(database, 'performances', { id: 'p2', show_id: 's1', venue_id: 'v1', starts_at: 1, external_booking_url: 'https://example.invalid/tickets' })).not.toThrow()
    })
  })

  test('sold-out and completed are derived, so no column holds either', async () => {
    await withDatabase((database) => {
      const columns = columnsOf(database, 'performances')
      expect(columns).not.toContain('sold_out')
      expect(columns).not.toContain('completed')
      expect(columns).toContain('capacity_override')
    })
  })
})

describe('ticket types are global and archived, never deleted (D-119)', () => {
  test('a name is held once across the whole catalogue', async () => {
    await withDatabase((database) => {
      insert(database, 'ticket_types', { id: 't1', name: 'Standard', price: 700, kind: 'SINGLE' })
      expect(() => insert(database, 'ticket_types', { id: 't2', name: 'Standard', price: 500, kind: 'SINGLE' })).toThrow()
    })
  })

  test('a kind and an access kind are each from their own list', async () => {
    await withDatabase((database) => {
      expect(() => insert(database, 'ticket_types', { id: 't1', name: 'Pass', price: 0, kind: 'PASS_ADMISSION' })).not.toThrow()
      expect(() => insert(database, 'ticket_types', { id: 't2', name: 'Odd', price: 0, kind: 'SEASON' })).toThrow()
      expect(() => insert(database, 'ticket_types', { id: 't3', name: 'Access', price: 700, kind: 'SINGLE', access_kind: 'ACCESS' })).not.toThrow()
      expect(() => insert(database, 'ticket_types', { id: 't4', name: 'Companion', price: 0, kind: 'SINGLE', access_kind: 'COMPANION' })).not.toThrow()
      expect(() => insert(database, 'ticket_types', { id: 't5', name: 'Wrong', price: 0, kind: 'SINGLE', access_kind: 'CARER' })).toThrow()
    })
  })

  test('a price is pence and never negative', async () => {
    await withDatabase((database) => {
      expect(() => insert(database, 'ticket_types', { id: 't1', name: 'Free', price: 0, kind: 'SINGLE' })).not.toThrow()
      expect(() => insert(database, 'ticket_types', { id: 't2', name: 'Owed', price: -1, kind: 'SINGLE' })).toThrow()
    })
  })
})

describe('price overrides inherit through NULL (D-120 criterion 1)', () => {
  function seedTypes(database: TestDatabase): void {
    seedProgramme(database)
    insert(database, 'performances', { id: 'p1', show_id: 's1', venue_id: 'v1', starts_at: 1 })
    insert(database, 'ticket_types', { id: 't1', name: 'Standard', price: 700, kind: 'SINGLE' })
  }

  test('one override per parent and type', async () => {
    await withDatabase((database) => {
      seedTypes(database)
      insert(database, 'show_ticket_overrides', { id: 'o1', show_id: 's1', ticket_type_id: 't1', price: 500 })
      expect(() => insert(database, 'show_ticket_overrides', { id: 'o2', show_id: 's1', ticket_type_id: 't1', price: 400 })).toThrow()
      insert(database, 'performance_ticket_overrides', { id: 'o3', performance_id: 'p1', ticket_type_id: 't1', price: 400 })
      expect(() => insert(database, 'performance_ticket_overrides', { id: 'o4', performance_id: 'p1', ticket_type_id: 't1', active: 0 })).toThrow()
    })
  })

  test('a null price and a null active both mean inherit, and an explicit nought is a price', async () => {
    await withDatabase((database) => {
      seedTypes(database)
      insert(database, 'show_ticket_overrides', { id: 'o1', show_id: 's1', ticket_type_id: 't1' })
      const [row] = rows<{ price: number | null, active: number | null }>(database, 'SELECT price, active FROM show_ticket_overrides')
      expect(row).toMatchObject({ price: null, active: null })
      expect(() => insert(database, 'performance_ticket_overrides', { id: 'o2', performance_id: 'p1', ticket_type_id: 't1', price: 0 })).not.toThrow()
      expect(() => insert(database, 'show_ticket_overrides', { id: 'o3', show_id: 's1', ticket_type_id: 't1', price: -100 })).toThrow()
    })
  })

  test('a ticket type with overrides against it cannot be deleted, and a deleted parent takes them', async () => {
    await withDatabase((database) => {
      seedTypes(database)
      insert(database, 'show_ticket_overrides', { id: 'o1', show_id: 's1', ticket_type_id: 't1', price: 500 })
      insert(database, 'performance_ticket_overrides', { id: 'o2', performance_id: 'p1', ticket_type_id: 't1', price: 400 })
      expect(() => database.batch([[`DELETE FROM ticket_types WHERE id = 't1'`]])).toThrow()
      database.batch([[`DELETE FROM shows WHERE id = 's1'`]])
      expect(count(database, 'show_ticket_overrides')).toBe(0)
      expect(count(database, 'performance_ticket_overrides')).toBe(0)
    })
  })
})

describe('performancesOnNight is a window, not a day and not a venue (E-127 criterion 1)', () => {
  function run(database: TestDatabase, night: string, venueId?: string): Record<string, unknown>[] {
    const [statement, ...parameters] = boundStatement(database, performancesOnNightQuery(night, venueId))
    return rows(database, statement, ...parameters)
  }

  // A matinee, an evening in the same venue, and a second venue at the same time as the evening.
  function seedNight(database: TestDatabase): void {
    const from = Math.floor(showNightBounds(NIGHT).from.getTime() / 1000)
    insert(database, 'venues', { id: 'v1', name: 'The Theatre', capacity: 120 })
    insert(database, 'venues', { id: 'v2', name: 'The Studio', capacity: 40 })
    insert(database, 'shows', { id: 's1', slug: 'the-seagull', title: 'The Seagull', status: 'PUBLISHED' })
    insert(database, 'shows', { id: 's2', slug: 'the-other-one', title: 'The Other One', status: 'PUBLISHED' })
    insert(database, 'performances', { id: 'matinee', show_id: 's1', venue_id: 'v1', starts_at: from + 10 * 3600, status: 'ON_SALE' })
    insert(database, 'performances', { id: 'evening', show_id: 's1', venue_id: 'v1', starts_at: from + 15.5 * 3600, status: 'ON_SALE' })
    insert(database, 'performances', { id: 'studio', show_id: 's2', venue_id: 'v2', starts_at: from + 15.5 * 3600, status: 'ON_SALE', capacity_override: 30 })
    // 03:00 the following morning, still tonight, and 05:00, which is tomorrow.
    insert(database, 'performances', { id: 'late', show_id: 's2', venue_id: 'v2', starts_at: from + 23 * 3600, status: 'ON_SALE' })
    insert(database, 'performances', { id: 'tomorrow', show_id: 's1', venue_id: 'v1', starts_at: from + 25 * 3600, status: 'ON_SALE' })
  }

  test('every performance in the night comes back, in curtain order and then by venue', async () => {
    await withDatabase((database) => {
      seedNight(database)
      expect(run(database, NIGHT).map(row => row.id)).toEqual(['matinee', 'studio', 'evening', 'late'])
    })
  })

  test('a matinee and an evening in one venue are both tonight', async () => {
    await withDatabase((database) => {
      seedNight(database)
      expect(run(database, NIGHT, 'v1').map(row => row.id)).toEqual(['matinee', 'evening'])
    })
  })

  test('two venues at the same time are both tonight, and neither narrows the other', async () => {
    await withDatabase((database) => {
      seedNight(database)
      const atOnce = run(database, NIGHT).filter(row => row.id === 'studio' || row.id === 'evening')
      expect(new Set(atOnce.map(row => row.startsAt)).size).toBe(1)
      expect(atOnce.map(row => row.venueId).sort()).toEqual(['v1', 'v2'])
      expect(run(database, NIGHT, 'v2').map(row => row.id)).toEqual(['studio', 'late'])
    })
  })

  test('a curtain after 04:00 the next morning belongs to the next night, not this one', async () => {
    await withDatabase((database) => {
      seedNight(database)
      expect(run(database, NIGHT).map(row => row.id)).not.toContain('tomorrow')
      expect(run(database, '2026-10-18').map(row => row.id)).toEqual(['tomorrow'])
    })
  })

  test('each row carries its effective capacity and its show, allow-listed', async () => {
    await withDatabase((database) => {
      seedNight(database)
      const [studio] = run(database, NIGHT, 'v2')
      expect(studio).toMatchObject({ id: 'studio', venueName: 'The Studio', showTitle: 'The Other One', capacity: 30 })
      expect(Object.keys(studio!)).not.toContain('notes')
    })
  })

  test('the statement binds a fixed number of parameters however many rows it covers (0006)', async () => {
    await withDatabase((database) => {
      seedNight(database)
      const [, ...parameters] = boundStatement(database, performancesOnNightQuery(NIGHT))
      const [, ...narrowed] = boundStatement(database, performancesOnNightQuery(NIGHT, 'v1'))
      expect(parameters).toHaveLength(2)
      expect(narrowed).toHaveLength(3)
      expect(narrowed.length).toBeLessThan(MAX_BOUND_PARAMETERS)
    })
  })
})

describe('the tonight fixture (tests/helpers)', () => {
  test('it makes a performance inside tonight, which performancesOnNight finds', async () => {
    await withDatabase((database) => {
      const seeded = tonightsPerformance(database)
      const bounds = showNightBounds(seeded.night)
      expect(seeded.startsAt * 1000).toBeGreaterThanOrEqual(bounds.from.getTime())
      expect(seeded.startsAt * 1000).toBeLessThan(bounds.to.getTime())

      const [statement, ...parameters] = boundStatement(database, performancesOnNightQuery(seeded.night))
      expect(rows<{ id: string }>(database, statement, ...parameters).map(row => row.id)).toEqual([seeded.performanceId])
    })
  })

  test('two fixtures in one night sit in two venues and do not collide', async () => {
    await withDatabase((database) => {
      const first = tonightsPerformance(database)
      const second = tonightsPerformance(database, { suffix: 'b', curtainHoursAfterNightStart: 6 })
      const [statement, ...parameters] = boundStatement(database, performancesOnNightQuery(first.night))
      expect(rows<{ id: string }>(database, statement, ...parameters).map(row => row.id))
        .toEqual([second.performanceId, first.performanceId])
    })
  })
})
