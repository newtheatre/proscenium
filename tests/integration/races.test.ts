import { describe, expect, test } from 'bun:test'
import { placesFrom, promotedBy, promotionClaimFor, signUpOrderStatement, withdrawStatement } from '#shared/utils/training-signup'
import type { Place, SignUpOrder } from '#shared/utils/training-signup'
import { ticketInsertQueries } from '#server/utils/capacity'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { ticketFixtures, tonightsPerformance } from '#tests/helpers/programme'

// Named regression cases (K-121). Every claim below is proven by a test that fires concurrent
// requests and asserts one winner, never by a comment (K-105, 0006).
describe('contended invariants (K-105)', () => {
  // D-105 criterion 1's named case. This proves the claim is one guarded statement whose second
  // execution writes nothing; an in-process SQLite serialises, so not that it is atomic (0022).
  test('the capacity race: concurrent claims on the last seat leave exactly one ticket', async () => {
    const database = await createTestDatabase()
    try {
      ticketFixtures(database)
      const seeded = tonightsPerformance(database, { capacityOverride: 1 })

      // Two orders for the one seat left, each shaped exactly as D-104 will batch it: the
      // reservation and its tickets together, every ticket carrying the capacity condition.
      const order = (id: string, seats: number): number => {
        database.batch([
          ['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
            id, id.toUpperCase(), seeded.performanceId, 'PENDING', 'WEB'],
          ...ticketInsertQueries(
            Array.from({ length: seats }, (_, index) => ({
              id: `${id}-t${index}`,
              reservationId: id,
              performanceId: seeded.performanceId,
              ticketTypeId: 'tt-standard',
              pricePaid: 900,
              priceSource: 'BASE' as const,
            })),
            1,
          ).map(statement => boundStatement(database, statement)),
        ])
        return rows<{ n: number }>(database, 'SELECT count(*) n FROM tickets WHERE reservation_id = ?', id)[0]?.n ?? 0
      }

      expect(order('r-one', 1)).toBe(1)
      expect(order('r-two', 1)).toBe(0)

      const held = rows<{ n: number }>(database, `
        SELECT count(*) n FROM tickets t JOIN reservations r ON r.id = t.reservation_id
        WHERE t.performance_id = ? AND t.refunded_at IS NULL AND r.status IN ('PENDING', 'COLLECTED', 'DOOR')
      `, seeded.performanceId)[0]?.n
      expect(held).toBe(1)

      // The loser's reservation exists and holds nothing, which is what the route turns into a
      // 409: no partial rows, and never one seat of a two-seat order.
      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets ORDER BY id').map(one => one.id))
        .toEqual(['r-one-t0'])
    }
    finally {
      database.close()
    }
  })

  // The other half of criterion 1: an order bigger than the house writes none of itself, rather
  // than filling the house and leaving the booker with part of a party.
  test('the capacity race: an order that will not fit writes none of its tickets', async () => {
    const database = await createTestDatabase()
    try {
      ticketFixtures(database)
      const seeded = tonightsPerformance(database, { capacityOverride: 2 })

      database.batch([
        ['INSERT INTO reservations (id, reference, performance_id, status, source) VALUES (?, ?, ?, ?, ?)',
          'r-party', 'RPARTY', seeded.performanceId, 'PENDING', 'WEB'],
        ...ticketInsertQueries(
          [0, 1, 2].map(index => ({
            id: `party-t${index}`,
            reservationId: 'r-party',
            performanceId: seeded.performanceId,
            ticketTypeId: 'tt-standard',
            pricePaid: 900,
            priceSource: 'BASE' as const,
          })),
          2,
        ).map(statement => boundStatement(database, statement)),
      ])

      expect(rows<{ id: string }>(database, 'SELECT id FROM tickets')).toEqual([])
    }
    finally {
      database.close()
    }
  })

  // G-116 criterion 4's named case, and K-121's seeded todo. The guard is one predicate repeated
  // on every statement in the batch, so the loser writes nothing at all rather than half a set.
  test('the register race: two submissions of one register produce exactly one set of awards', async () => {
    const database = await createTestDatabase()
    try {
      const now = Math.floor(Date.now() / 1000)
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-trainer', 't@example.invalid', 'A Trainer'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-one', 'one@example.invalid', 'One'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-two', 'two@example.invalid', 'Two'],
        ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
        [`INSERT INTO modules (id, department, kind, name, status) VALUES ('TECH-1', 'TECH', 'MODULE', 'Rigging', 'ACTIVE')`],
        [`INSERT INTO training_sessions (id, held_on, starts_at, ends_at, capacity, trainer_id, register_opened_at)
          VALUES ('s1', '2026-10-05', '19:00', '21:00', 20, 'u-trainer', ?)`, now],
        [`INSERT INTO session_modules (id, session_id, module_id) VALUES ('sm1', 's1', 'TECH-1')`],
        [`INSERT INTO session_attendees (id, session_id, user_id, signed_up_at) VALUES ('a1', 's1', 'u-one', ?)`, now],
        [`INSERT INTO session_attendees (id, session_id, user_id, signed_up_at) VALUES ('a2', 's1', 'u-two', ?)`, now],
      ])

      // One submission, exactly as the write path shapes it: the stamp, then every other statement
      // guarded on the register still being unmarked.
      const submit = (by: string, at: number): void => {
        database.batch([
          [`UPDATE training_sessions SET marked_at = ?, marked_by = ?, status = 'DELIVERED'
            WHERE id = 's1' AND marked_at IS NULL`, at, by],
          [`INSERT INTO training_records (id, user_id, module_id, awarded_on, source, session_id, granted_by)
            SELECT ?, 'u-one', 'TECH-1', '2026-10-05', 'SESSION', 's1', ?
            WHERE EXISTS (SELECT 1 FROM training_sessions WHERE id = 's1' AND marked_at = ? AND marked_by = ?)`,
          `r-${by}-one`, by, at, by],
          [`INSERT INTO training_records (id, user_id, module_id, awarded_on, source, session_id, granted_by)
            SELECT ?, 'u-two', 'TECH-1', '2026-10-05', 'SESSION', 's1', ?
            WHERE EXISTS (SELECT 1 FROM training_sessions WHERE id = 's1' AND marked_at = ? AND marked_by = ?)`,
          `r-${by}-two`, by, at, by],
        ])
      }

      submit('u-trainer', now)
      submit('u-one', now + 1)

      // One winner, and the records are theirs.
      const stamped = rows<{ markedBy: string }>(database, `SELECT marked_by markedBy FROM training_sessions WHERE id = 's1'`)
      expect(stamped[0]?.markedBy).toBe('u-trainer')

      const awarded = rows<{ id: string }>(database, 'SELECT id FROM training_records ORDER BY id')
      expect(awarded).toHaveLength(2)
      expect(awarded.every(row => row.id.startsWith('r-u-trainer'))).toBe(true)

      // Nobody holds a module twice, which is what a partial second set would have produced.
      const perPerson = rows<{ userId: string, n: number }>(
        database,
        `SELECT user_id userId, count(*) n FROM training_records GROUP BY user_id ORDER BY user_id`,
      )
      expect(perPerson).toEqual([{ userId: 'u-one', n: 1 }, { userId: 'u-two', n: 1 }])
    }
    finally {
      database.close()
    }
  })

  // G-115 criterion 4. The stamp is a conditional write, so the second device's update matches
  // nothing rather than opening the register a second time.
  test('the register-open race: two devices opening one register open it once', async () => {
    const database = await createTestDatabase()
    try {
      const now = Math.floor(Date.now() / 1000)
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-trainer', 't@example.invalid', 'A Trainer'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-one', 'one@example.invalid', 'One'],
        ['INSERT INTO departments (code, name) VALUES (?, ?)', 'BAR', 'Bar'],
        [`INSERT INTO modules (id, department, kind, name, status) VALUES ('BAR-1', 'BAR', 'MODULE', 'Till', 'ACTIVE')`],
        [`INSERT INTO training_sessions (id, held_on, starts_at, ends_at, capacity, trainer_id)
          VALUES ('s1', '2026-10-05', '19:00', '21:00', 20, 'u-trainer')`],
        [`INSERT INTO session_modules (id, session_id, module_id) VALUES ('sm1', 's1', 'BAR-1')`],
        [`INSERT INTO session_attendees (id, session_id, user_id, signed_up_at) VALUES ('a1', 's1', 'u-one', ?)`, now],
      ])

      const open = (by: string, at: number): number => {
        database.batch([[
          `UPDATE training_sessions SET register_opened_at = ?, register_opened_by = ?
           WHERE id = 's1' AND register_opened_at IS NULL`, at, by,
        ]])
        const won = rows<{ by: string }>(
          database, `SELECT register_opened_by by FROM training_sessions WHERE id = 's1'`,
        )[0]?.by === by
        return won ? 1 : 0
      }

      expect(open('u-trainer', now)).toBe(1)
      expect(open('u-one', now + 1)).toBe(0)

      expect(rows<{ at: number, by: string }>(
        database, `SELECT register_opened_at at, register_opened_by by FROM training_sessions WHERE id = 's1'`,
      )[0]).toMatchObject({ at: now, by: 'u-trainer' })
    }
    finally {
      database.close()
    }
  })
  test.todo('a shift is claimable by exactly one person', () => {})

  // C-107's named case. This proves the claim is one guarded statement whose second execution
  // writes nothing; an in-process SQLite serialises, so not that it is atomic (0022).
  test('the slot race: the second claim on one span writes nothing', async () => {
    const database = await createTestDatabase()
    try {
      const now = Math.floor(Date.now() / 1000)
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-booker', 'booker@example.invalid', 'A Booker'],
        ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-studio', 'The Studio'],
      ])

      const claim = (id: string, startsAt: number, endsAt: number): number => {
        database.batch([[
          `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
           SELECT ?, 'r-studio', 'u-booker', 'Rehearsal', ?, ?, 'GENERAL', 'CONFIRMED'
           WHERE NOT EXISTS (
             SELECT 1 FROM room_bookings
             WHERE room_id = 'r-studio' AND status IN ('CONFIRMED', 'PENDING_APPROVAL')
               AND starts_at < ? AND ends_at > ?
           )`,
          id, startsAt, endsAt, endsAt, startsAt,
        ]])
        return rows<{ n: number }>(database, 'SELECT count(*) n FROM room_bookings WHERE id = ?', id)[0]!.n
      }

      expect(claim('b-first', now + 3600, now + 7200)).toBe(1)
      expect(claim('b-second', now + 3600, now + 7200)).toBe(0)
      // Half-open: the one starting where the first ends is not a clash (criterion 5).
      expect(claim('b-after', now + 7200, now + 10800)).toBe(1)
    }
    finally {
      database.close()
    }
  })
  // G-122's named case. Revocation is idempotent, so the second attempt must write nothing and
  // log nothing rather than refuse: two administrators pressing the button is not an error.
  test('the revocation race: the second revocation writes no row and no second entry', async () => {
    const database = await createTestDatabase()
    try {
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-held', 'held@example.invalid', 'A Member'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-admin', 'admin@example.invalid', 'An Officer'],
        ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
        ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'TECH-111', 'TECH', 'MODULE', 'Working at height'],
        [`INSERT INTO training_records (id, user_id, module_id, awarded_on, source)
          VALUES ('tr-1', 'u-held', 'TECH-111', '2026-09-01', 'SIGNOFF')`],
      ])

      // The two statements the route runs, in the order it runs them: the entry first, because the
      // update would otherwise falsify the guard the entry rides on.
      const revoke = (entryId: string, at: number): void => {
        database.batch([
          [`INSERT INTO audit_log (id, actor_id, action, target, detail)
            SELECT ?, 'u-admin', 'record.revoked', 'user:u-held', '{"record":"tr-1"}'
            WHERE EXISTS (SELECT 1 FROM training_records WHERE id = 'tr-1' AND revoked_at IS NULL)`, entryId],
          [`UPDATE training_records SET revoked_at = ?, revoked_by = 'u-admin', revoke_reason = 'Found not competent'
            WHERE id = 'tr-1' AND revoked_at IS NULL`, at],
        ])
      }

      revoke('al-first', 1789000000)
      revoke('al-second', 1789999999)

      // One stamp, and it is the first one: the loser changed nothing.
      expect(rows<{ at: number }>(database, `SELECT revoked_at at FROM training_records WHERE id = 'tr-1'`)[0]?.at)
        .toBe(1789000000)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'record.revoked'`)).toHaveLength(1)
      // Never deleted: the row is still there, still readable, still naming its award (criterion 5).
      expect(rows<{ awarded: string }>(database, `SELECT awarded_on awarded FROM training_records`)[0]?.awarded)
        .toBe('2026-09-01')
    }
    finally {
      database.close()
    }
  })

  test.todo('at most one confirmed duty manager per performance', () => {})

  // G-106's named case (criterion 3). Two withdrawals interleave the way two browser tabs do:
  // each reads the order, cancels, reads again and claims what moved. The claim is the decider.
  test('the promotion race: two concurrent withdrawals notify each promoted member exactly once', async () => {
    const database = await createTestDatabase()
    try {
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-trainer', 'trainer@example.invalid', 'A Trainer'],
        ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
        ['INSERT INTO modules (id, department, kind, name, status) VALUES (?, ?, ?, ?, ?)',
          'TECH-111', 'TECH', 'MODULE', 'Working at height', 'ACTIVE'],
        [`INSERT INTO training_sessions (id, held_on, starts_at, ends_at, capacity, status, trainer_id)
          VALUES ('s1', '2027-01-14', '19:00', '21:00', 2, 'OPEN', 'u-trainer')`],
      ])

      const everybody = ['u-one', 'u-two', 'u-three', 'u-four']
      for (const [index, id] of everybody.entries()) {
        database.batch([
          ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', id, `${id}@example.invalid`, `Member ${id}`],
          [`INSERT INTO session_attendees (id, session_id, user_id, signed_up_at) VALUES (?, 's1', ?, ?)`,
            `a-${id}`, id, 100 + index],
        ])
      }

      const order = (): Place[] => {
        const [text, ...parameters] = boundStatement(database, signUpOrderStatement('s1'))
        return placesFrom(database.raw.prepare(text).all(...parameters as never[]) as SignUpOrder[], 2)
      }

      // The claim, exactly as `claimNotification` writes it: an insert the partial unique index
      // refuses the second time, never a read followed by a write (0006).
      const sent: string[] = []
      const claim = (place: Place): void => {
        const key = promotionClaimFor('s1', place.userId, place.signedUpAt)
        // The insert's own return says whether it took, so the loser sends nothing without ever
        // having read the ledger first.
        const took = database.raw.prepare(
          `INSERT INTO notification_log (id, user_id, type, channel, status, session_id, claim, sent_at)
           VALUES (?, ?, 'training.session.promoted', 'EMAIL', 'SENT', 's1', ?, 1)
           ON CONFLICT DO NOTHING RETURNING id`,
        ).all(crypto.randomUUID().replaceAll('-', ''), place.userId, key) as { id: string }[]
        if (took.length > 0) sent.push(key)
      }

      // Both read the order before either has written, which is the interleaving that makes both
      // of them see the same promotions.
      const beforeOne = order()
      const beforeTwo = order()

      database.batch([boundStatement(database, withdrawStatement('s1', 'u-one'))])
      database.batch([boundStatement(database, withdrawStatement('s1', 'u-two'))])

      for (const place of promotedBy(beforeOne, order())) claim(place)
      for (const place of promotedBy(beforeTwo, order())) claim(place)

      // Both promoted, each told once, and nobody who already held a place told anything.
      expect(sent.sort()).toEqual([
        promotionClaimFor('s1', 'u-four', 103),
        promotionClaimFor('s1', 'u-three', 102),
      ].sort())
      expect(rows(database, `SELECT id FROM notification_log WHERE type = 'training.session.promoted'`))
        .toHaveLength(2)
      expect(rows(database, `SELECT id FROM notification_log WHERE user_id IN ('u-one', 'u-two')`))
        .toHaveLength(0)
    }
    finally {
      database.close()
    }
  })

  test.todo('a sale\'s payment, lines and stock movements commit atomically', () => {})
})
