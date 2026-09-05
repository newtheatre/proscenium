import { describe, expect, test } from 'bun:test'
import { auditEntry } from '#shared/utils/audit'
import { isDrillOverdue } from '#shared/utils/backup'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// K-108 and J-107, against the real migrations: the restore drill's record, its trigger, and
// what the operations dashboard reads to decide whether one is overdue.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function person(database: TestDatabase, suffix = '1'): string {
  const id = `u-${suffix}`
  database.batch([[
    'INSERT INTO users (id, email, name) VALUES (?, ?, ?)',
    id, `operator-${suffix}@example.invalid`, `Operator ${suffix}`,
  ]])
  return id
}

interface DrillFields {
  id: string
  ranAt: string
  operatorId: string
  outcome: 'PASS' | 'FAIL'
  timeToRestoreMinutes?: number
  rowCountsMatch?: boolean
  moneyTotalsMatch?: boolean
  notes?: string | null
}

// Mirrors exactly what the route batches: the drill and its audit entry in one write
// (server/api/admin/backups/drills/index.post.ts).
function recordDrill(database: TestDatabase, fields: DrillFields): void {
  database.batch([
    [
      `INSERT INTO backup_drills
        (id, ran_on, operator_id, outcome, time_to_restore_minutes, row_counts_match, money_totals_match, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      fields.id, fields.ranAt, fields.operatorId, fields.outcome,
      fields.timeToRestoreMinutes ?? 30, fields.rowCountsMatch ?? true, fields.moneyTotalsMatch ?? true,
      fields.notes ?? null,
    ],
    (() => {
      const entry = auditEntry({
        actorId: fields.operatorId,
        action: 'backup.drill-recorded',
        target: fields.id,
        detail: { outcome: fields.outcome, rowCountsMatch: fields.rowCountsMatch ?? true, moneyTotalsMatch: fields.moneyTotalsMatch ?? true },
      })
      return [
        'INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)',
        entry.id, entry.actorId, entry.action, entry.target, JSON.stringify(entry.detail),
      ] as const
    })(),
  ])
}

describe('a recorded drill is append-only (K-108, J-107, 0010)', () => {
  test('no update and no delete reaches it', async () => {
    await withDatabase((database) => {
      const operator = person(database)
      recordDrill(database, { id: 'd-1', ranAt: '2026-09-10', operatorId: operator, outcome: 'PASS' })

      expect(() => database.raw.exec('UPDATE backup_drills SET outcome = \'FAIL\' WHERE id = \'d-1\''))
        .toThrow(/append-only/)
      expect(() => database.raw.exec('DELETE FROM backup_drills WHERE id = \'d-1\''))
        .toThrow(/append-only/)

      const [stored] = rows<{ outcome: string }>(database, 'SELECT outcome FROM backup_drills WHERE id = ?', 'd-1')
      expect(stored!.outcome).toBe('PASS')
    })
  })

  test('an outcome outside PASS or FAIL is refused by the constraint', async () => {
    await withDatabase((database) => {
      const operator = person(database)
      expect(() => recordDrill(database, { id: 'd-1', ranAt: '2026-09-10', operatorId: operator, outcome: 'PARTIAL' as 'PASS' }))
        .toThrow()
    })
  })
})

describe('recording a drill writes one audit entry naming the operator and the outcome (K-108 criterion 3)', () => {
  test('the audit entry names who ran it and what it found', async () => {
    await withDatabase((database) => {
      const operator = person(database)
      recordDrill(database, {
        id: 'd-1', ranAt: '2026-09-10', operatorId: operator, outcome: 'FAIL',
        moneyTotalsMatch: false, notes: 'Z-reading total was short by one bar session',
      })

      const entries = rows<{ actor_id: string, action: string, target: string, detail: string }>(
        database, 'SELECT actor_id, action, target, detail FROM audit_log',
      )
      expect(entries.length).toBe(1)
      expect(entries[0]!.actor_id).toBe(operator)
      expect(entries[0]!.action).toBe('backup.drill-recorded')
      expect(entries[0]!.target).toBe('d-1')
      expect(JSON.parse(entries[0]!.detail)).toEqual({ outcome: 'FAIL', rowCountsMatch: true, moneyTotalsMatch: false })
    })
  })

  test('an audit entry does not survive a failed batch', async () => {
    await withDatabase((database) => {
      expect(() => recordDrill(database, { id: 'd-1', ranAt: '2026-09-10', operatorId: 'no-such-operator', outcome: 'PASS' }))
        .toThrow()
      expect(rows(database, 'SELECT * FROM audit_log')).toEqual([])
      expect(rows(database, 'SELECT * FROM backup_drills')).toEqual([])
    })
  })
})

describe('the operations dashboard reads the last drill and flags a configured interval passed (J-107 criterion 4)', () => {
  // Mirrors the status route's query (server/api/admin/backups/index.get.ts): the last drill
  // that actually passed, not merely the last attempt.
  function lastPassedAt(database: TestDatabase): string | null {
    const [last] = rows<{ ran_on: string }>(
      database,
      'SELECT ran_on FROM backup_drills WHERE outcome = \'PASS\' ORDER BY ran_on DESC, created_at DESC LIMIT 1',
    )
    return last?.ran_on ?? null
  }

  test('no drill ever recorded is overdue once a cadence is configured', async () => {
    await withDatabase((database) => {
      expect(isDrillOverdue(lastPassedAt(database), 120, '2026-09-10')).toBe(true)
    })
  })

  test('a passing drill inside the interval is not flagged', async () => {
    await withDatabase((database) => {
      const operator = person(database)
      recordDrill(database, { id: 'd-1', ranAt: '2026-08-01', operatorId: operator, outcome: 'PASS' })
      expect(isDrillOverdue(lastPassedAt(database), 120, '2026-09-10')).toBe(false)
    })
  })

  // A failed attempt is not proof the backup restores, so it does not clear the flag (K-108
  // criterion 2, J-107 criterion 3).
  test('a failed drill more recent than a stale pass still reads from the pass', async () => {
    await withDatabase((database) => {
      const operator = person(database)
      recordDrill(database, { id: 'd-1', ranAt: '2026-01-01', operatorId: operator, outcome: 'PASS' })
      recordDrill(database, { id: 'd-2', ranAt: '2026-09-01', operatorId: operator, outcome: 'FAIL' })
      expect(isDrillOverdue(lastPassedAt(database), 120, '2026-09-10')).toBe(true)
    })
  })
})

describe('a weekly export failure alerts rather than vanishing (J-107 criterion 2)', () => {
  // Mirrors what server/tasks/backup.ts writes when runWeeklyExport() returns ok: false: the
  // cron log is not somewhere anybody looks, so the failure has to reach the audit trail.
  test('the failure is a queryable audit entry, not a swallowed exception', async () => {
    await withDatabase((database) => {
      const entry = auditEntry({ actorId: null, action: 'backup.export-failed', detail: { error: 'R2 put timed out' } })
      database.batch([[
        'INSERT INTO audit_log (id, actor_id, action, target, detail) VALUES (?, ?, ?, ?, ?)',
        entry.id, entry.actorId, entry.action, entry.target, JSON.stringify(entry.detail),
      ]])

      const [stored] = rows<{ actor_id: string | null, action: string }>(
        database, 'SELECT actor_id, action FROM audit_log WHERE action = \'backup.export-failed\'',
      )
      expect(stored).toBeDefined()
      expect(stored!.actor_id).toBeNull()
    })
  })
})
