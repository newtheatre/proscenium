import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// A record on the real migrations. Append-only admits three named edits and refuses everything
// else, so each disjunct of the trigger is exercised in both directions (0010, 0011, G-122, G-124).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase, columns: Record<string, unknown> = {}): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'member@example.invalid', 'A Member'],
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u2', 'lead@example.invalid', 'A Lead'],
    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
    ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'TECH-111', 'TECH', 'MODULE', 'Working at height'],
  ])
  award(database, { id: 'r1', ...columns })
}

function award(database: TestDatabase, columns: Record<string, unknown>): void {
  const values = {
    user_id: 'u1',
    module_id: 'TECH-111',
    awarded_on: '2026-09-14',
    source: 'SIGNOFF',
    granted_by: 'u2',
    ...columns,
  }
  const names = Object.keys(values)
  database.batch([[
    `INSERT INTO training_records (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ]])
}

const set = (assignment: string, id = 'r1'): [string] =>
  [`UPDATE training_records SET ${assignment} WHERE id = '${id}'`]

describe('the award itself is frozen (0010)', () => {
  // Each of these is a fact about what happened. A correction is a newer record, never an edit.
  const frozen = [
    `id = 'r2'`,
    `user_id = 'u2'`,
    `module_id = 'TECH-111x'`,
    `awarded_on = '2026-01-01'`,
    `source = 'EXTERNAL'`,
    `session_id = 's1'`,
    `granted_by = 'u1'`,
    `expiry_overridden = 1`,
    `created_at = 1`,
  ]

  for (const assignment of frozen) {
    test(`${assignment.split(' ')[0]} cannot be rewritten`, async () => {
      await withDatabase((database) => {
        seed(database)
        expect(() => database.batch([set(assignment)])).toThrow(/append-only/i)
      })
    })
  }

  test('a record cannot be deleted', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => database.batch([[`DELETE FROM training_records WHERE id = 'r1'`]])).toThrow(/append-only/i)
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(1)
    })
  })

  test('the person and the module cannot be deleted out from under it', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => database.batch([[`DELETE FROM users WHERE id = 'u1'`]])).toThrow()
      expect(() => database.batch([[`DELETE FROM modules WHERE id = 'TECH-111'`]])).toThrow()
    })
  })
})

describe('a revocation is stamped once (G-122)', () => {
  const revoke = `revoked_at = 1789000000, revoked_by = 'u2', revoke_reason = 'Found not competent'`

  test('the first stamp is allowed and the record survives it', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([set(revoke)])
      const [held] = rows<{ awarded: string, revoked: number }>(
        database,
        `SELECT awarded_on awarded, revoked_at revoked FROM training_records WHERE id = 'r1'`,
      )
      expect(held).toMatchObject({ awarded: '2026-09-14', revoked: 1789000000 })
    })
  })

  test('a second stamp with different values is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([set(revoke)])
      expect(() => database.batch([set(`revoked_at = 1789999999`)])).toThrow(/append-only/i)
      expect(() => database.batch([set(`revoked_by = 'u1'`)])).toThrow(/append-only/i)
      expect(() => database.batch([set(`revoke_reason = 'A different reason'`)])).toThrow(/append-only/i)
    })
  })

  // Nothing un-revokes: the way back is a new award, which is what supersession means.
  test('a revocation cannot be lifted', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([set(revoke)])
      expect(() => database.batch([set(`revoked_at = NULL`)])).toThrow(/append-only/i)
    })
  })
})

describe('erasure reaches the free text through the guard (0011, G-122 criterion 6)', () => {
  test('evidence clears, and cannot be set or rewritten', async () => {
    await withDatabase((database) => {
      seed(database, { evidence_ref: 'Certificate held by A Member' })
      expect(() => database.batch([set(`evidence_ref = 'Something else'`)])).toThrow(/append-only/i)

      database.batch([set(`evidence_ref = NULL`)])
      expect(rows<{ evidence: string | null }>(database, `SELECT evidence_ref evidence FROM training_records`)[0]?.evidence)
        .toBeNull()

      expect(() => database.batch([set(`evidence_ref = 'Put it back'`)])).toThrow(/append-only/i)
    })
  })

  // The case the third clause exists for: free text written at revocation is still reachable.
  test('a reason clears on an already-revoked record', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([set(`revoked_at = 1789000000, revoked_by = 'u2', revoke_reason = 'A Member was found not competent'`)])
      database.batch([set(`revoke_reason = NULL`)])

      const [held] = rows<{ reason: string | null, revoked: number }>(
        database,
        `SELECT revoke_reason reason, revoked_at revoked FROM training_records WHERE id = 'r1'`,
      )
      expect(held?.reason).toBeNull()
      expect(held?.revoked).toBe(1789000000)
    })
  })

  // The generic scrubber writes both columns at once, on every row it can see, so it has to be a
  // no-op where there was nothing to clear rather than a refusal.
  test('clearing both at once passes, and passes again on a record with nothing to clear', async () => {
    await withDatabase((database) => {
      seed(database, { evidence_ref: 'A Member' })
      const scrub = set(`evidence_ref = NULL, revoke_reason = NULL`)
      database.batch([scrub])
      database.batch([scrub])
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(1)
    })
  })
})

describe('an expiry is restated only where recalculation may (G-124 criteria 1 and 4)', () => {
  test('a live record on the module policy can be restated', async () => {
    await withDatabase((database) => {
      seed(database, { expires_on: '2027-09-14' })
      database.batch([set(`expires_on = '2028-09-14'`)])
      expect(rows<{ expires: string }>(database, `SELECT expires_on expires FROM training_records`)[0]?.expires)
        .toBe('2028-09-14')
    })
  })

  test('an overridden expiry is refused, because recalculation skips it', async () => {
    await withDatabase((database) => {
      seed(database, { expires_on: '2027-09-14', expiry_overridden: 1 })
      expect(() => database.batch([set(`expires_on = '2028-09-14'`)])).toThrow(/append-only/i)
    })
  })

  test('a revoked record is refused, for the same reason', async () => {
    await withDatabase((database) => {
      seed(database, { expires_on: '2027-09-14' })
      database.batch([set(`revoked_at = 1789000000, revoked_by = 'u2', revoke_reason = 'Withdrawn'`)])
      expect(() => database.batch([set(`expires_on = '2028-09-14'`)])).toThrow(/append-only/i)
    })
  })
})

describe('what a record may say (0018, G-120)', () => {
  test('a source outside the five is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => award(database, { id: 'r2', source: 'GUESSED' })).toThrow()
    })
  })

  test('all five are accepted, including the one nothing writes', async () => {
    await withDatabase((database) => {
      seed(database)
      for (const [index, source] of ['SESSION', 'EXTERNAL', 'SELF', 'LEGACY'].entries()) {
        award(database, { id: `r${index + 2}`, source })
      }
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(5)
    })
  })

  test('an expiry on or before the award is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => award(database, { id: 'r2', expires_on: '2026-09-14' })).toThrow()
      expect(() => award(database, { id: 'r3', expires_on: '2026-09-13' })).toThrow()
    })
  })

  // Nothing stores whether a record is valid: the dates are the whole of what is kept (0018).
  test('the table holds dates and provenance, and no state column', async () => {
    await withDatabase((database) => {
      seed(database)
      const columns = rows<{ name: string }>(database, `SELECT name FROM pragma_table_info('training_records')`)
        .map(column => column.name)
      expect(columns).toEqual([
        'id', 'user_id', 'module_id', 'awarded_on', 'expires_on', 'expiry_overridden', 'source',
        'session_id', 'granted_by', 'evidence_ref', 'revoked_at', 'revoked_by', 'revoke_reason',
        'created_at',
      ])
    })
  })
})

describe('one register awards one record per person per module (G-116, 0006)', () => {
  test('a second award for the same session, person and module is refused', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { id: 'r2', session_id: 's1', source: 'SESSION' })
      expect(() => award(database, { id: 'r3', session_id: 's1', source: 'SESSION' })).toThrow()
    })
  })

  test('revoking the first frees the pair, because a re-grant is the correction path', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { id: 'r2', session_id: 's1', source: 'SESSION' })
      database.batch([set(`revoked_at = 1789000000, revoked_by = 'u2', revoke_reason = 'Marked in error'`, 'r2')])
      award(database, { id: 'r3', session_id: 's1', source: 'SESSION' })
      expect(rows(database, `SELECT id FROM training_records WHERE session_id = 's1'`)).toHaveLength(2)
    })
  })

  // The index is partial, so awards outside a register are not constrained by it: a renewal is a
  // newer record for the same person and module, and supersession is derived (G-120 criterion 6).
  test('two sign-offs for one person and module are both allowed', async () => {
    await withDatabase((database) => {
      seed(database)
      award(database, { id: 'r2', awarded_on: '2027-09-14' })
      expect(rows(database, 'SELECT id FROM training_records')).toHaveLength(2)
    })
  })
})
