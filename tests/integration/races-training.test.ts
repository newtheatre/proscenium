import { describe, expect, test } from 'bun:test'
import { placesFrom, promotedBy, promotionClaimFor, signUpOrderStatement, withdrawStatement } from '#shared/utils/training-signup'
import type { Place, SignUpOrder } from '#shared/utils/training-signup'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'

// Named regression cases (K-121), not among K-105's four invariants: training's own revocation
// and promotion races, each proven by a test that fires concurrent writes and asserts one winner.
describe('contended invariants (K-105)', () => {
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
})
