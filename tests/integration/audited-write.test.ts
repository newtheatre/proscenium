import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { auditedWrite } from '#server/utils/audit'
import { closePeriod, defineTerm, reopenPeriod } from '#server/utils/period-locks'
import { setNominalMapping } from '#server/utils/su-export'
import { auditEntry } from '#shared/utils/audit'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { bindD1 } from '#tests/helpers/d1'
import type { EntrySource, LineKind } from '#shared/utils/ledger'
import type { TestDatabase } from '#tests/helpers/database'

// #1562: each finance write runs end to end through the D1 binding, and says it applied when it
// did. auditedWrite reads success from the rows its statement returns (0049).

let database: TestDatabase
const TREASURER = 'treasurer-1'

beforeEach(async () => {
  database = await createTestDatabase()
  database.batch([['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', TREASURER, 'treasurer-1@e2e.newtheatre.org.uk', 'A treasurer']])
  bindD1(database)
})

afterEach(() => {
  database.close()
})

const trail = (action: string): unknown[] => rows(database, 'SELECT id FROM audit_log WHERE action = ?', action)

describe('a finance write says it applied when it did (#1562)', () => {
  test('closing a period', async () => {
    const closed = await closePeriod({ fromDay: '2026-01-01', toDay: '2026-01-31', label: 'January' }, TREASURER)
    expect(closed.applied).toBe(true)
    expect(rows(database, 'SELECT id FROM period_locks WHERE id = ? AND action = ?', closed.id, 'CLOSED')).toHaveLength(1)
    expect(trail('finance.period.closed')).toHaveLength(1)
  })

  test('reopening the period it closed', async () => {
    const closed = await closePeriod({ fromDay: '2026-02-01', toDay: '2026-02-28' }, TREASURER)
    const reopened = await reopenPeriod(closed.id, TREASURER)
    expect(reopened?.applied).toBe(true)
    expect(rows(database, 'SELECT id FROM period_locks WHERE action = ?', 'REOPENED')).toHaveLength(1)
    expect(trail('finance.period.reopened')).toHaveLength(1)
  })

  test('defining a term', async () => {
    const defined = await defineTerm({ label: 'Autumn term', fromDay: '2026-09-28', toDay: '2026-12-11' }, TREASURER)
    expect(defined.applied).toBe(true)
    expect(rows(database, 'SELECT id FROM periods WHERE id = ?', defined.id)).toHaveLength(1)
    expect(trail('finance.period.defined')).toHaveLength(1)
  })

  test('changing a nominal mapping', async () => {
    const [pair] = rows<{ kind: LineKind, source: EntrySource }>(database, 'SELECT kind, source FROM su_nominal_mappings LIMIT 1')
    expect(await setNominalMapping({ kind: pair!.kind, source: pair!.source, nominalCode: '4999' }, TREASURER)).toBe(true)
    expect(rows(database, 'SELECT kind FROM su_nominal_mappings WHERE kind = ? AND source = ? AND nominal_code = ?', pair!.kind, pair!.source, '4999')).toHaveLength(1)
    expect(trail('finance.nominal-mapping.changed')).toHaveLength(1)
  })
})

// The guard: a statement that returns no rows cannot say whether it applied, so it is refused
// before anything is written rather than read as a failure after it was.
describe('auditedWrite refuses a statement that returns no rows', () => {
  test('a run is refused, and neither it nor its audit entry lands', async () => {
    const entry = auditEntry({ actorId: TREASURER, action: 'finance.period.defined', target: 'period:guard', detail: {} })
    const write = db.run(sql`INSERT INTO periods (id, label, from_day, to_day, created_by) VALUES ('guard', 'Guard', '2026-01-01', '2026-01-02', ${TREASURER})`)
    await expect(auditedWrite(write, entry)).rejects.toThrow('RETURNING')
    expect(rows(database, 'SELECT id FROM periods WHERE id = ?', 'guard')).toHaveLength(0)
    expect(trail('finance.period.defined')).toHaveLength(0)
  })
})
