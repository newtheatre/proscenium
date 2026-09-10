import { describe, expect, test } from 'bun:test'
import { mergedTombstoneEmail, mergeStatements, planGrantMerge } from '#shared/utils/account-merge'
import type { GrantRow, MergeStatementsInput, TrainingRecordRow } from '#shared/utils/account-merge'
import { boundFromSQL } from '../../scripts/seed/statements'

const grant = (over: Partial<GrantRow> = {}): GrantRow => ({ id: 'g-1', role: 'BOX_OFFICE', expiresAt: null, ...over })

const base: MergeStatementsInput = {
  winnerId: 'w', loserId: 'l', actorId: 'admin',
  grantPlan: { reassign: [], extend: [], retire: [] },
  trainingRecords: [],
  now: 1000,
}

const record = (over: Partial<TrainingRecordRow> = {}): TrainingRecordRow => ({
  id: 'tr-1', moduleId: 'mod-1', awardedOn: '2026-09-01', expiresOn: null, expiryOverridden: false,
  source: 'SESSION', sessionId: null, grantedBy: null, evidenceRef: null,
  revokedAt: null, revokedBy: null, revokeReason: null, ...over,
})

describe('planning a role_grants merge (A-123 criterion 1, 0009)', () => {
  test('a role the winner does not hold moves across untouched', () => {
    const plan = planGrantMerge([], [grant({ id: 'loser-grant', role: 'BOX_OFFICE', expiresAt: 100 })])
    expect(plan).toEqual({ reassign: ['loser-grant'], extend: [], retire: [] })
  })

  test('the loser never expiring beats a winner with a date: the winner is extended, the loser retires', () => {
    const winnerGrants = [grant({ id: 'winner-grant', role: 'BOX_OFFICE', expiresAt: 100 })]
    const loserGrants = [grant({ id: 'loser-grant', role: 'BOX_OFFICE', expiresAt: null })]
    const plan = planGrantMerge(winnerGrants, loserGrants)
    expect(plan).toEqual({ reassign: [], extend: [{ id: 'winner-grant', expiresAt: null }], retire: ['loser-grant'] })
  })

  test('a later dated expiry on the loser extends the winner', () => {
    const winnerGrants = [grant({ id: 'winner-grant', role: 'BOX_OFFICE', expiresAt: 100 })]
    const loserGrants = [grant({ id: 'loser-grant', role: 'BOX_OFFICE', expiresAt: 200 })]
    const plan = planGrantMerge(winnerGrants, loserGrants)
    expect(plan).toEqual({ reassign: [], extend: [{ id: 'winner-grant', expiresAt: 200 }], retire: ['loser-grant'] })
  })

  test('a winner already holding the more generous grant is left alone; the loser still retires so the merged account never holds two rows for one role', () => {
    const winnerGrants = [grant({ id: 'winner-grant', role: 'BOX_OFFICE', expiresAt: null })]
    const loserGrants = [grant({ id: 'loser-grant', role: 'BOX_OFFICE', expiresAt: 200 })]
    const plan = planGrantMerge(winnerGrants, loserGrants)
    expect(plan).toEqual({ reassign: [], extend: [], retire: ['loser-grant'] })
  })

  test('two accounts holding the same role with an identical expiry: no extension, just one row', () => {
    const winnerGrants = [grant({ id: 'winner-grant', role: 'ADMIN', expiresAt: 100 })]
    const loserGrants = [grant({ id: 'loser-grant', role: 'ADMIN', expiresAt: 100 })]
    expect(planGrantMerge(winnerGrants, loserGrants)).toEqual({ reassign: [], extend: [], retire: ['loser-grant'] })
  })

  test('unrelated roles on each side both move, independently of each other', () => {
    const winnerGrants = [grant({ id: 'w-1', role: 'BOX_OFFICE', expiresAt: 100 })]
    const loserGrants = [grant({ id: 'l-1', role: 'FOH_MANAGER', expiresAt: 100 })]
    expect(planGrantMerge(winnerGrants, loserGrants)).toEqual({ reassign: ['l-1'], extend: [], retire: [] })
  })
})

describe('the merge tombstone (0011)', () => {
  test('carries its own prefix, distinct from erasure\'s, matched by deliverability.ts', () => {
    expect(mergedTombstoneEmail('abc123')).toBe('merged-abc123@anonymised.invalid')
  })
})

describe('the statements a merge runs (A-123 criteria 1, 3, 5)', () => {
  test('moves bookings, shifts and membership by a plain predicate, never a per-row IN list (0006)', () => {
    const { moves } = mergeStatements(base)
    const bound = boundFromSQL(moves)
    const tables = bound.map(([statement]) => statement)
    expect(tables.some(statement => statement.includes('room_bookings'))).toBe(true)
    expect(tables.some(statement => statement.includes('room_series'))).toBe(true)
    expect(tables.some(statement => statement.includes('reservations'))).toBe(true)
    expect(tables.some(statement => statement.includes('shifts'))).toBe(true)
    expect(tables.some(statement => statement.includes('memberships'))).toBe(true)
    // Every one of these binds exactly the winner and loser id: never a list sized by row count.
    for (const [, ...parameters] of bound) expect(parameters.length).toBe(2)
  })

  test('never reassigns a training record: the append-only trigger refuses any UPDATE touching user_id (0010, 0041)', () => {
    const records = [record({ id: 'tr-live' })]
    const { moves } = mergeStatements({ ...base, trainingRecords: records })
    const bound = boundFromSQL(moves)
    for (const [statement] of bound) {
      if (!statement.includes('training_records')) continue
      expect(statement.toLowerCase()).not.toMatch(/update training_records set[^;]*user_id/)
    }
  })

  test('a live record is carried forward as a fresh row and the original is revoked once, never deleted', () => {
    const records = [record({ id: 'tr-live', moduleId: 'mod-9', awardedOn: '2026-01-01' })]
    const { moves } = mergeStatements({ ...base, trainingRecords: records })
    const bound = boundFromSQL(moves)

    const inserted = bound.find(([statement]) => statement.toLowerCase().includes('insert into training_records'))
    expect(inserted?.[0]).toContain('training_records')
    expect(inserted).toContain('w')
    expect(inserted).toContain('mod-9')
    expect(inserted).toContain('2026-01-01')

    const revoked = bound.find(([statement]) => statement.toLowerCase().startsWith('update training_records set revoked_at'))
    expect(revoked?.[0]).toContain('revoked_at is null')
    expect(revoked).toContain('tr-live')
    expect(revoked).toContain('admin')
  })

  test('an already-revoked record is copied forward but not revoked again', () => {
    const records = [record({ id: 'tr-revoked', revokedAt: 500, revokedBy: 'someone', revokeReason: 'not competent' })]
    const { moves } = mergeStatements({ ...base, trainingRecords: records })
    const bound = boundFromSQL(moves)
    const touchingRecord = bound.filter(([, ...parameters]) => parameters.includes('tr-revoked'))
    expect(touchingRecord).toHaveLength(0)
    expect(bound.some(([statement]) => statement.toLowerCase().includes('insert into training_records'))).toBe(true)
  })

  test('retires every credential table on the loser, and touches no table keyed to the winner', () => {
    const { retireCredentials } = mergeStatements(base)
    const bound = boundFromSQL(retireCredentials)
    expect(bound).toHaveLength(7)
    for (const [statement, ...parameters] of bound) {
      expect(statement.toLowerCase()).toContain('delete from')
      expect(parameters).toEqual(['l'])
    }
  })

  test('the tombstone update predicates on anonymised_at is null and returns id, the changes() gate 0049 gives every contended write', () => {
    const { tombstone } = mergeStatements(base)
    const [[statement, ...parameters]] = boundFromSQL([tombstone])
    expect(statement).toContain('anonymised_at is null')
    expect(statement.toLowerCase()).toContain('returning')
    expect(parameters).toContain(mergedTombstoneEmail('l'))
  })
})
