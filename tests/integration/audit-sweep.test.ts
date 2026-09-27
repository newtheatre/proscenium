import { describe, expect, test } from 'bun:test'
import { auditIfChanged, auditIfRow, auditWhere } from '#server/utils/audit'
import { createOpeningStatement } from '#server/utils/bar-openings'
import { ticketInsertQueries } from '#server/utils/capacity'
import { cancelPerformanceStatement, performanceSaleStatement } from '#server/utils/performances'
import { editTicketsStatements } from '#server/utils/reservations'
import { replaceTemplateStatements, templateVenueIsOurs } from '#server/utils/rota'
import { auditEntry } from '#shared/utils/audit'
import { erasureStatements } from '#shared/utils/erasure'
import { signUpStatement, walkInRejoinStatement, walkInStatement } from '#shared/utils/training-signup'
import { boundStatement, createTestDatabase, rows, sql } from '#tests/helpers/database'
import { testVenue, ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Decision 0049 against the real migrations: a conditional write's audit row lands in the same
// batch and only when the write changed something, so a write that changed nothing logs nothing.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

// One transaction, in order, as D1 runs a batch, so `changes()` reads the statement just before it.
function batch(database: TestDatabase, statements: SQL[]): unknown[][] {
  return database.raw.transaction(() => statements.map((statement) => {
    const [text, ...parameters] = boundStatement(database, statement)
    return database.raw.prepare(text).all(...parameters as never[]) as unknown[]
  }))()
}

function logged(database: TestDatabase, action: string): number {
  return rows<{ n: number }>(database, 'SELECT count(*) AS n FROM audit_log WHERE action = ?', action)[0]!.n
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)', id, `Someone ${id}`, `${id}@example.invalid`]])
  return id
}

const entry = (action: string, target: string) => auditEntry({ actorId: null, action, target })

describe('the helpers write the audit row only where the write it follows did something', () => {
  test('auditIfRow logs a row that exists, and nothing for one that does not', async () => {
    await withDatabase((database) => {
      person(database, 'u-real')
      batch(database, [auditIfRow(entry('account.profile.updated', 'user:u-real'), 'users', 'u-real')])
      batch(database, [auditIfRow(entry('account.profile.updated', 'user:u-none'), 'users', 'u-none')])
      expect(logged(database, 'account.profile.updated')).toBe(1)
    })
  })

  test('auditWhere answers with the row it wrote, so a caller can read whether it applied', async () => {
    await withDatabase((database) => {
      const [held] = batch(database, [auditWhere(entry('account.profile.updated', 'user:x'), sql`1 = 1`)])
      const [refused] = batch(database, [auditWhere(entry('account.profile.updated', 'user:y'), sql`1 = 0`)])
      expect(held).toHaveLength(1)
      expect(refused).toHaveLength(0)
    })
  })
})

// 1. A walk-in already on the register changed nothing, so nothing is logged (G-117).
describe('a walk-in already on the register logs nothing', () => {
  function seed(database: TestDatabase): void {
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-trainer', 'trainer@example.invalid', 'A Trainer'],
      [`INSERT INTO training_sessions (id, held_on, starts_at, ends_at, capacity, status, trainer_id)
        VALUES ('s1', '2027-01-14', '19:00', '21:00', 4, 'OPEN', 'u-trainer')`],
    ])
  }

  test('signed up already: neither the walk-in nor the rejoin writes, and no row is logged', async () => {
    await withDatabase((database) => {
      seed(database)
      person(database, 'u-early')
      batch(database, [signUpStatement('a1', 's1', 'u-early', 1_800_000_000)])

      const added = entry('session.attendee.added', 'session:s1')
      const [walkedIn] = batch(database, [walkInStatement('a2', 's1', 'u-early', 1_800_000_100), auditIfChanged(added)])
      const [rejoined] = batch(database, [walkInRejoinStatement('s1', 'u-early', 1_800_000_100), auditIfChanged(added)])

      expect(walkedIn).toHaveLength(0)
      expect(rejoined).toHaveLength(0)
      expect(logged(database, 'session.attendee.added')).toBe(0)
    })
  })

  test('somebody new walks in and is logged once', async () => {
    await withDatabase((database) => {
      seed(database)
      person(database, 'u-new')
      batch(database, [walkInStatement('a1', 's1', 'u-new', 1_800_000_000), auditIfChanged(entry('session.attendee.added', 'session:s1'))])
      expect(logged(database, 'session.attendee.added')).toBe(1)
    })
  })
})

// 2. Two officers cancelling at once write one cancellation and one audit row (D-121, 0003).
describe('cancelling a performance twice logs it once', () => {
  test('the second cancel matches nothing and writes no row', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database)
      const cancel = (): unknown[] => batch(database, [cancelPerformanceStatement(performanceId), auditIfChanged(entry('performance.cancelled', `performance:${performanceId}`))])[0]!

      expect(cancel()).toHaveLength(1)
      expect(cancel()).toHaveLength(0)
      expect(logged(database, 'performance.cancelled')).toBe(1)
    })
  })
})

// 3. A ticket swap whose guard failed changed nothing, even at the same total (D-110 criterion 2).
describe('a ticket edit on a booking no longer pending logs nothing and is not applied', () => {
  function booking(database: TestDatabase, status: string): { performanceId: string, reservationId: string } {
    ticketTypeFixture(database)
    database.batch([['INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, ?, ?)', 'tt-concession', 'Concession', 700, 'SINGLE']])
    const { performanceId } = tonightsPerformance(database)
    database.batch([['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)', 'r1', 'R00001', performanceId, 'PENDING', 'WEB']])
    for (const statement of ticketInsertQueries([
      { id: 't1', reservationId: 'r1', performanceId, ticketTypeId: 'tt-standard', pricePaid: 900, priceSource: 'BASE' },
      { id: 't2', reservationId: 'r1', performanceId, ticketTypeId: 'tt-standard', pricePaid: 900, priceSource: 'BASE' },
    ], null)) batch(database, [statement])
    database.batch([['UPDATE reservations SET status = ? WHERE id = ?', status, 'r1']])
    return { performanceId, reservationId: 'r1' }
  }

  // Two standard for one standard and one concession: the same total either way.
  function swap(database: TestDatabase, performanceId: string): unknown[][] {
    return batch(database, editTicketsStatements({
      reservationId: 'r1',
      performanceId,
      capacity: null,
      additions: [{ id: 't3', reservationId: 'r1', performanceId, ticketTypeId: 'tt-concession', pricePaid: 700, priceSource: 'BASE' }],
      removals: [{ ticketTypeId: 'tt-standard', quantity: 1 }],
      desiredTotal: 2,
      actorId: null,
    }, entry('reservation.tickets-changed', 'reservation:r1')))
  }

  test('collected mid-edit: no ticket moves, no row is logged, and the audit says it did not apply', async () => {
    await withDatabase((database) => {
      const { performanceId } = booking(database, 'COLLECTED')
      const [audited] = swap(database, performanceId)

      expect(audited).toHaveLength(0)
      expect(logged(database, 'reservation.tickets-changed')).toBe(0)
      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets WHERE reservation_id = ? ORDER BY id', 'r1')).toEqual([{ id: 't1' }, { id: 't2' }])
    })
  })

  test('still pending: the swap lands and is logged once', async () => {
    await withDatabase((database) => {
      const { performanceId } = booking(database, 'PENDING')
      const [audited] = swap(database, performanceId)

      expect(audited).toHaveLength(1)
      expect(logged(database, 'reservation.tickets-changed')).toBe(1)
      expect(rows<{ n: number }>(database, 'SELECT count(*) AS n FROM tickets WHERE reservation_id = ? AND ticket_type_id = ?', 'r1', 'tt-concession')[0]!.n).toBe(1)
    })
  })
})

// 5. Two erasures of one account at once log one erasure (K-109 criterion 4).
describe('erasing an account twice logs it once', () => {
  test('the second erasure matches nothing and writes no row', async () => {
    await withDatabase((database) => {
      person(database, 'u-gone')
      const erase = (at: number): unknown[][] => batch(database, [...erasureStatements('u-gone', at), auditWhere(entry('account.erased', 'user:u-gone'), sql`changes() = 1`)])

      expect(erase(1_780_000_000).at(-1)).toHaveLength(1)
      expect(erase(1_780_000_060).at(-1)).toHaveLength(0)
      expect(logged(database, 'account.erased')).toBe(1)
    })
  })
})

// 7. A sale toggle from a status the performance no longer holds changes nothing (D-121).
describe('putting a performance on or off sale from a stale status logs nothing', () => {
  test('two officers taking it off sale at once: one change, one row', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database)
      const offSale = (): unknown[] => batch(database, [performanceSaleStatement(performanceId, 'ON_SALE', 'DRAFT'), auditIfChanged(entry('performance.off-sale', `performance:${performanceId}`))])[0]!

      expect(offSale()).toHaveLength(1)
      expect(offSale()).toHaveLength(0)
      expect(logged(database, 'performance.off-sale')).toBe(1)
    })
  })

  test('a cancelled performance goes on sale nowhere', async () => {
    await withDatabase((database) => {
      const { performanceId } = tonightsPerformance(database)
      database.batch([['UPDATE performances SET status = ? WHERE id = ?', 'CANCELLED', performanceId]])
      expect(batch(database, [performanceSaleStatement(performanceId, 'CANCELLED', 'ON_SALE')])[0]).toHaveLength(0)
    })
  })
})

// 8. An opening whose venue's bar row went writes no opening and logs none (E-130 criterion 2).
describe('a bar opening that was not created logs nothing', () => {
  test('no bar row at the venue: no opening, no row', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database, { suffix: 'dry' })
      person(database, 'officer')
      batch(database, [
        createOpeningStatement('o1', { venueId: venue.id, night: '2026-10-17', label: 'Society social', startsAt: 1_792_000_000, endsAt: 1_792_010_000 }, 'officer'),
        auditIfRow(entry('bar-opening.created', 'bar-opening:o1'), 'bar_openings', 'o1'),
      ])
      expect(logged(database, 'bar-opening.created')).toBe(0)
    })
  })
})

// 9. A template written for a venue made external meanwhile writes no slot and logs none (E-101).
describe('a shift template for a venue made external logs nothing', () => {
  test('external: no slot, no row; ours: the slots and one row', async () => {
    await withDatabase((database) => {
      person(database, 'officer')
      const away = testVenue(database, { suffix: 'away', isExternal: true })
      const house = testVenue(database, { suffix: 'house' })
      const write = (venueId: string): unknown[][] => batch(database, [
        ...replaceTemplateStatements(venueId, [{ role: 'DOOR', count: 2 }], 'officer'),
        auditWhere(entry('shift-template.updated', `venue:${venueId}`), templateVenueIsOurs(venueId)),
      ])

      expect(write(away.id).at(-1)).toHaveLength(0)
      expect(write(house.id).at(-1)).toHaveLength(1)
      expect(logged(database, 'shift-template.updated')).toBe(1)
    })
  })
})

// 10. Removing an authenticator app that is not there removes nothing and logs nothing (A-110).
describe('removing an authenticator app nobody set up logs nothing', () => {
  test('no factor: no row; a factor: one row', async () => {
    await withDatabase((database) => {
      person(database, 'u-plain')
      person(database, 'u-factor')
      database.batch([['INSERT INTO totp_secrets (user_id, secret) VALUES (?, ?)', 'u-factor', 'SECRETSECRET']])
      const remove = (userId: string): unknown[][] => batch(database, [
        sql`DELETE FROM totp_secrets WHERE user_id = ${userId}`,
        auditWhere(entry('mfa.removed', `user:${userId}`), sql`changes() = 1`),
      ])

      expect(remove('u-plain').at(-1)).toHaveLength(0)
      expect(remove('u-factor').at(-1)).toHaveLength(1)
      expect(logged(database, 'mfa.removed')).toBe(1)
    })
  })
})
