import { describe, expect, test } from 'bun:test'
import { passAdmissionTicketInsert } from '#server/utils/capacity'
import { passAdmissionAllows, redeemablePassQuery } from '#server/utils/pass-redemption'
import { erasureStatements } from '#shared/utils/erasure'
import { PERSONAL_TABLES } from '#shared/utils/personal-data'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// A fellowship is the theatre's record about a person rather than the person's own, which is why
// it behaves unlike everything else attached to an account (0023, A-127).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function addPerson(database: TestDatabase, id: string, email: string): void {
  database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', id, email, 'An Alumna (test)']])
}

function award(database: TestDatabase, id: string, userId: string): void {
  database.batch([[
    'INSERT INTO fellowships (id, user_id, awarded_on, awarded_by, citation) VALUES (?, ?, ?, ?, ?)',
    id, userId, '2019-06-12', 'Committee, 12 June 2019', 'For a decade behind the lighting desk.',
  ]])
}

describe('a fellowship is held once and for life (A-127)', () => {
  test('a second award to the same person is refused by the constraint, not by the form', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'fellow@example.invalid')
      award(database, 'f-1', 'u-1')
      expect(() => award(database, 'f-2', 'u-1')).toThrow()
    })
  })

  // Criterion 6. Nothing deletes a user, but the reference is what makes that a guarantee rather
  // than a convention.
  test('deleting the person is refused while an award stands', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'fellow@example.invalid')
      award(database, 'f-1', 'u-1')
      expect(() => database.batch([['DELETE FROM users WHERE id = ?', 'u-1']])).toThrow()
    })
  })

  // Criterion 4: a revocation is a second fact, not a correction to the first.
  test('revoking rewrites nothing the award recorded', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'fellow@example.invalid')
      award(database, 'f-1', 'u-1')
      database.batch([[
        'UPDATE fellowships SET revoked_at = ?, revoked_by = ?, revocation_reason = ? WHERE id = ?',
        1780000000, 'u-2', 'A safeguarding matter.', 'f-1',
      ]])

      const [held] = rows<{ awarded: string, citation: string, revoked: number }>(
        database, 'SELECT awarded_on AS awarded, citation, revoked_at AS revoked FROM fellowships WHERE id = ?', 'f-1')
      expect(held!.awarded).toBe('2019-06-12')
      expect(held!.citation).toContain('lighting desk')
      expect(held!.revoked).toBe(1780000000)
    })
  })
})

describe('an erasure leaves the award standing (0011, A-127 criterion 6)', () => {
  test('the person is anonymised, the award survives, and only the reason goes', async () => {
    await withDatabase((database) => {
      addPerson(database, 'u-1', 'fellow@example.invalid')
      award(database, 'f-1', 'u-1')
      database.batch([['UPDATE fellowships SET revocation_reason = ? WHERE id = ?', 'Named somebody.', 'f-1']])

      // One batch, all or nothing, the way production runs it (K-109 criterion 1).
      database.batch(erasureStatements('u-1', 1780000001).map(statement => boundStatement(database, statement)))

      const [held] = rows<{ citation: string, reason: string | null }>(
        database, 'SELECT citation, revocation_reason AS reason FROM fellowships WHERE id = ?', 'f-1')
      expect(held).toBeDefined()
      expect(held!.citation).toContain('lighting desk')
      expect(held!.reason).toBeNull()

      const [person] = rows<{ name: string }>(database, 'SELECT name FROM users WHERE id = ?', 'u-1')
      expect(person!.name).toBe('Deleted user')
    })
  })

  test('the registry keeps the row rather than deleting it, which is what restrict relies on', () => {
    const entry = PERSONAL_TABLES.find(table => table.name === 'fellowships')
    expect(entry).toBeDefined()
    expect(entry!.erasure).toBe('scrub')
    expect(entry!.scrub).toEqual(['revocation_reason'])
  })
})

// The lifetime entitlement itself (0023, D-130): a Fellowship pass, issued the way
// server/utils/fellowship-pass.ts issues one, covering a show it was never explicitly told about.
function fellowshipPass(database: TestDatabase, id: string, userId: string): void {
  database.batch([
    ['INSERT INTO pass_types (id, slug, name, status, valid_from, valid_until) VALUES (?, ?, ?, ?, ?, ?)',
      'pt-fellowship', 'fellowship', 'Fellowship', 'DRAFT', 0, 4102444800],
    ['INSERT INTO pass_type_prices (id, pass_type_id, label, price) VALUES (?, ?, ?, 0)', 'pt-fellowship-price', 'pt-fellowship', 'Fellowship'],
    ['INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
      id, id.toUpperCase().slice(0, 6), 'pt-fellowship', 'pt-fellowship-price', userId, 'ACTIVE', userId],
  ])
}

describe('a Fellowship covers every show without being told about one (0023, D-130 criteria 1, 2)', () => {
  test('the booking page offers it for a show pass_type_shows never named', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database)
      addPerson(database, 'u-fellow', 'fellow@example.invalid')
      fellowshipPass(database, 'pass-fellow', 'u-fellow')

      const [offered] = rows<{ id: string }>(database,
        ...boundStatement(database, redeemablePassQuery('u-fellow', tonight.performanceId, tonight.showId, 500)))
      expect(offered?.id).toBe('pass-fellow')
    }
    finally {
      database.close()
    }
  })

  test('it redeems into an ordinary capacity-checked ticket, same as any other pass', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database, { venueCapacity: 100 })
      ticketTypeFixture(database)
      addPerson(database, 'u-fellow', 'fellow@example.invalid')
      fellowshipPass(database, 'pass-fellow', 'u-fellow')
      database.batch([
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-fellow', 'RFELLO', tonight.performanceId, 'u-fellow', 'PENDING', 'WEB'],
      ])

      const written = rows<{ id: string }>(database,
        ...boundStatement(database, passAdmissionTicketInsert(
          { id: 't-fellow', reservationId: 'r-fellow', performanceId: tonight.performanceId, ticketTypeId: 'tt-standard', pricePaid: 0, priceSource: 'BASE' },
          passAdmissionAllows('pass-fellow', tonight.performanceId, tonight.showId, 500),
          100,
        )))
      expect(written).toHaveLength(1)
    }
    finally {
      database.close()
    }
  })
})

describe('an erased Fellow is refused, not silently admitted or silently failed (D-130, 0062)', () => {
  test('the contended write finds nothing to spend once the holder is a tombstone', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database, { venueCapacity: 100 })
      ticketTypeFixture(database)
      addPerson(database, 'u-fellow', 'fellow@example.invalid')
      fellowshipPass(database, 'pass-fellow', 'u-fellow')
      database.batch([
        ['INSERT INTO reservations (id, reference, performance_id, user_id, status, source) VALUES (?, ?, ?, ?, ?, ?)',
          'r-fellow', 'RFELLO', tonight.performanceId, 'u-fellow', 'PENDING', 'WEB'],
      ])

      // One batch, all or nothing, the way production erases (K-109 criterion 1).
      database.batch(erasureStatements('u-fellow', 1_780_000_002).map(statement => boundStatement(database, statement)))

      const written = rows<{ id: string }>(database,
        ...boundStatement(database, passAdmissionTicketInsert(
          { id: 't-fellow', reservationId: 'r-fellow', performanceId: tonight.performanceId, ticketTypeId: 'tt-standard', pricePaid: 0, priceSource: 'BASE' },
          passAdmissionAllows('pass-fellow', tonight.performanceId, tonight.showId, 500),
          100,
        )))
      expect(written).toHaveLength(0)

      // The pass itself was never written back over; it still reads exactly as issued (0062).
      const [pass] = rows<{ status: string }>(database, 'SELECT status FROM passes WHERE id = ?', 'pass-fellow')
      expect(pass!.status).toBe('ACTIVE')
    }
    finally {
      database.close()
    }
  })

  test('no longer offered on the booking page either, once the holder is a tombstone', async () => {
    const database = await createTestDatabase()
    try {
      const tonight = tonightsPerformance(database)
      addPerson(database, 'u-fellow', 'fellow@example.invalid')
      fellowshipPass(database, 'pass-fellow', 'u-fellow')
      database.batch(erasureStatements('u-fellow', 1_780_000_003).map(statement => boundStatement(database, statement)))

      const offered = rows<{ id: string }>(database,
        ...boundStatement(database, redeemablePassQuery('u-fellow', tonight.performanceId, tonight.showId, 500)))
      expect(offered).toHaveLength(0)
    }
    finally {
      database.close()
    }
  })
})
