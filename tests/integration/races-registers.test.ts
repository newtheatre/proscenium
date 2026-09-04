import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'

// K-105 criterion 3: two racing submissions of the same register resolve to exactly one set of
// awards, and the loser writes no partial set.
describe('contended invariants (K-105)', () => {
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
})
