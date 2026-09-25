import { describe, expect, test } from 'bun:test'
import { checklistVenuesClause, venueChecklistsQuery } from '#server/utils/checklist'
import { boardReadinessQuery, fohManagersQuery, gatingModulesQuery, venueReadinessQuery } from '#server/utils/rota-readiness'
import { currentCardsQuery, emergencyCardsClause } from '#server/utils/venue-emergency'
import { checklistVenuesList } from '#shared/utils/checklist-venues-list'
import { emergencyCardsList } from '#shared/utils/emergency-cards-list'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { showNightOf } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Issue 1318's readiness card and the Set-up screens it points at, against the real migrations:
// what each venue we run still needs, and which venues those screens list at all.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): Record<string, unknown>[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows(database, query, ...parameters)
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

function mark(database: TestDatabase, venueId: string, flags: { external?: boolean, archived?: boolean }): void {
  database.batch([['UPDATE venues SET is_external = ?, archived = ? WHERE id = ?', flags.external ? 1 : 0, flags.archived ? 1 : 0, venueId]])
}

function template(database: TestDatabase, venueId: string, role: string, count: number): void {
  database.batch([['INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)', `${venueId}-${role}`, venueId, role, count]])
}

function systemItem(database: TestDatabase, venueId: string, check: string, active = true): void {
  database.batch([[
    'INSERT INTO checklist_items (id, venue_id, phase, label, sort, required, system_check, active) VALUES (?, ?, \'POST\', ?, 0, 1, ?, ?)',
    `${venueId}-${check}`, venueId, check, check, active ? 1 : 0,
  ]])
}

function card(database: TestDatabase, venueId: string, id: string, address: string | null, updatedAt: number): void {
  const officer = person(database, 'officer')
  database.batch([[
    'INSERT INTO venue_emergency_info (id, venue_id, address, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)',
    id, venueId, address, officer, updatedAt,
  ]])
}

interface ReadinessRow { venueId: string, venueName: string, templateSlots: number, systemChecks: string | null, emergencyFiled: number }

function readiness(database: TestDatabase): ReadinessRow[] {
  return run(database, venueReadinessQuery()) as unknown as ReadinessRow[]
}

describe('the readiness card lists only the venues we run (issue 1318)', () => {
  test('an external venue and a retired one are left off', async () => {
    await withDatabase((database) => {
      testVenue(database, { suffix: 'ours' })
      testVenue(database, { suffix: 'hired' })
      testVenue(database, { suffix: 'gone' })
      mark(database, 'venue-hired', { external: true })
      mark(database, 'venue-gone', { archived: true })

      expect(readiness(database).map(row => row.venueId)).toEqual(['venue-ours'])
    })
  })

  test('a venue with nothing set up reads as no slots, no checks and no card', async () => {
    await withDatabase((database) => {
      testVenue(database)
      expect(readiness(database)).toEqual([
        { venueId: 'venue-a', venueName: 'The Test House a', templateSlots: 0, systemChecks: null, emergencyFiled: 0 },
      ])
    })
  })

  test('slots add up across roles, and only active system checks count', async () => {
    await withDatabase((database) => {
      testVenue(database)
      template(database, 'venue-a', 'DUTY_MANAGER', 1)
      template(database, 'venue-a', 'DOOR', 2)
      systemItem(database, 'venue-a', 'NO_SHOW_HOLDS_RELEASED')
      systemItem(database, 'venue-a', 'INCIDENTS_REVIEWED', false)

      const [row] = readiness(database)
      expect(row?.templateSlots).toBe(3)
      expect(row?.systemChecks).toBe('NO_SHOW_HOLDS_RELEASED')
    })
  })

  test('a card counts as filed only when its latest version carries an address (E-113 criterion 1)', async () => {
    await withDatabase((database) => {
      testVenue(database, { suffix: 'filed' })
      testVenue(database, { suffix: 'blanked' })
      card(database, 'venue-filed', 'c-1', 'The New Theatre, Nottingham', 100)
      card(database, 'venue-blanked', 'c-2', 'The New Theatre, Nottingham', 100)
      card(database, 'venue-blanked', 'c-3', null, 200)

      const filed = new Map(readiness(database).map(row => [row.venueId, row.emergencyFiled]))
      expect(filed.get('venue-filed')).toBe(1)
      expect(filed.get('venue-blanked')).toBe(0)
    })
  })
})

describe('the board and the gating modules, read once each', () => {
  test('the board counts active presets and milestones, the seeded ones included', async () => {
    await withDatabase((database) => {
      const [board] = run(database, boardReadinessQuery())
      expect(board).toEqual({ presets: 4, milestones: 6 })

      database.batch([['UPDATE backstage_presets SET active = 0 WHERE label = ?', 'Hold']])
      expect(run(database, boardReadinessQuery())[0]).toEqual({ presets: 3, milestones: 6 })
    })
  })

  test('the named modules come back with their name and lifecycle, and an unknown id with nothing', async () => {
    await withDatabase((database) => {
      database.batch([
        ['INSERT INTO departments (code, name) VALUES (?, ?)', 'ADMN', 'Administration'],
        ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)', 'ADMN-102', 'ADMN', 'MODULE', 'Selling Alcohol', 'ACTIVE'],
        ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)', 'ADMN-201', 'ADMN', 'MODULE', 'Committee Operations and Governance', 'DRAFT'],
      ])
      const found = run(database, gatingModulesQuery(['ADMN-102', 'ADMN-201', 'ADMN-999']))
      expect(found).toEqual([
        { id: 'ADMN-102', name: 'Selling Alcohol', status: 'ACTIVE' },
        { id: 'ADMN-201', name: 'Committee Operations and Governance', status: 'DRAFT' },
      ])
    })
  })
})

describe('whom a member asks about a role not open yet (issue 1318)', () => {
  function grant(database: TestDatabase, userId: string, role: string, expiresAt: number | null): void {
    database.batch([['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', `${userId}-${role}`, userId, role, expiresAt]])
  }

  test('a live Front of House Manager is named; a lapsed one, a disabled one and another role are not', async () => {
    await withDatabase((database) => {
      const now = Math.floor(Date.now() / 1000)
      for (const id of ['live', 'lapsed', 'disabled', 'treasurer']) person(database, id)
      grant(database, 'live', 'FOH_MANAGER', now + 86_400)
      grant(database, 'lapsed', 'FOH_MANAGER', now - 86_400)
      grant(database, 'disabled', 'FOH_MANAGER', null)
      grant(database, 'treasurer', 'TREASURER', null)
      database.batch([['UPDATE users SET disabled = 1 WHERE id = ?', 'disabled']])

      expect(run(database, fohManagersQuery(now)).map(row => row.name)).toEqual(['Someone live'])
    })
  })
})

const checklistClause = () => checklistVenuesClause(filterQuerySchema(checklistVenuesList).parse({}))
const cardsClause = () => emergencyCardsClause(filterQuerySchema(emergencyCardsList).parse({}))

function checklistVenues(database: TestDatabase): string[] {
  return [...new Set(run(database, venueChecklistsQuery(checklistClause(), 25, 0)).map(row => row.venueId as string))]
}

function cardVenues(database: TestDatabase): string[] {
  return run(database, currentCardsQuery(cardsClause(), 25, 0)).map(row => row.venueId as string)
}

describe('an external venue is off Checklists and Emergency cards until it is staffed (issue 1318)', () => {
  test('an external venue with nothing on it is not listed on either screen', async () => {
    await withDatabase((database) => {
      testVenue(database, { suffix: 'ours' })
      testVenue(database, { suffix: 'hired' })
      mark(database, 'venue-hired', { external: true })

      expect(checklistVenues(database)).toEqual(['venue-ours'])
      expect(cardVenues(database)).toEqual(['venue-ours'])
    })
  })

  test('a shift on one of its performances from tonight onwards lists it on both', async () => {
    await withDatabase((database) => {
      const made = tonightsPerformance(database, { suffix: 'hired' })
      mark(database, made.venueId, { external: true })
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, \'DUTY_MANAGER\', 1, \'OPEN\')', 'sh-1', made.performanceId]])

      expect(checklistVenues(database)).toEqual([made.venueId])
      expect(cardVenues(database)).toEqual([made.venueId])
    })
  })

  test('a shift on a night already over does not', async () => {
    await withDatabase((database) => {
      const night = showNightOf(new Date(Date.now() - 7 * 86_400_000))
      const made = tonightsPerformance(database, { suffix: 'hired', night })
      mark(database, made.venueId, { external: true })
      database.batch([['INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, \'DUTY_MANAGER\', 1, \'OPEN\')', 'sh-1', made.performanceId]])

      expect(checklistVenues(database)).toEqual([])
      expect(cardVenues(database)).toEqual([])
    })
  })

  test('one already configured stays listed, so nothing set up becomes unreachable', async () => {
    await withDatabase((database) => {
      testVenue(database, { suffix: 'checked' })
      testVenue(database, { suffix: 'carded' })
      mark(database, 'venue-checked', { external: true })
      mark(database, 'venue-carded', { external: true })
      systemItem(database, 'venue-checked', 'INCIDENTS_REVIEWED', false)
      card(database, 'venue-carded', 'c-1', 'Somebody else\'s hall', 100)

      expect(checklistVenues(database)).toEqual(['venue-checked'])
      expect(cardVenues(database)).toEqual(['venue-carded'])
    })
  })
})
