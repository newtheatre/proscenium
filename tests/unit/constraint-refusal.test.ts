import { describe, expect, test } from 'bun:test'
import { constraintRefusal } from '#shared/utils/constraint-refusal'
import type { ConstraintRefusal } from '#shared/utils/constraint-refusal'

// The shared write-path helper every module's own table calls into (0047).

const TABLE: ConstraintRefusal[] = [
  { violated: 'shifts.performance_id', says: 'This performance already has a confirmed duty manager' },
  { violated: 'shifts.performance_id, shifts.role, shifts.slot', says: 'That slot on this performance is already on the rota' },
  { violated: 'shifts_open_names_nobody', says: 'An open shift names nobody' },
]

describe('a recognised constraint reads as a refusal', () => {
  test('a bare local failure matches', () => {
    const refusal = constraintRefusal(TABLE, new Error('UNIQUE constraint failed: shifts.performance_id'))
    expect(refusal?.statusCode).toBe(409)
    expect(refusal?.statusMessage).toContain('duty manager')
  })

  test('a CHECK failure matches by its constraint name, not an index name', () => {
    expect(constraintRefusal(TABLE, new Error('CHECK constraint failed: shifts_open_names_nobody'))?.statusMessage)
      .toBe('An open shift names nobody')
  })

  // D1 wraps the message and appends its own code; the same failure has to read the same way.
  test('a D1-wrapped failure matches too', () => {
    const wrapped = new Error('D1_ERROR: UNIQUE constraint failed: shifts.performance_id: SQLITE_CONSTRAINT')
    expect(constraintRefusal(TABLE, wrapped)?.statusMessage).toContain('duty manager')
  })

  // The slot index names three columns and the duty manager index names one of them: a substring
  // match would answer the wrong refusal.
  test('a longer violated name is not read as the shorter one it starts with', () => {
    const taken = new Error('UNIQUE constraint failed: shifts.performance_id, shifts.role, shifts.slot')
    expect(constraintRefusal(TABLE, taken)?.statusMessage).toBe('That slot on this performance is already on the rota')
  })
})

describe('the match is anchored, not a substring search (0047)', () => {
  // The defect the shared helper exists to close: an unanchored match would misread this as the
  // duty manager refusal, turning an unrelated failure into a friendly 409.
  test('a message that merely contains the phrase, not at the start, is not a refusal', () => {
    const echoed = new Error('saving note "constraint failed: shifts.performance_id" failed validation')
    expect(constraintRefusal(TABLE, echoed)).toBeNull()
  })

  test('text after the recognised D1 suffix is not a refusal', () => {
    const trailing = new Error('UNIQUE constraint failed: shifts.performance_id and then some more')
    expect(constraintRefusal(TABLE, trailing)).toBeNull()
  })

  test('text before the constraint type is not a refusal', () => {
    const leading = new Error('while inserting: UNIQUE constraint failed: shifts.performance_id')
    expect(constraintRefusal(TABLE, leading)).toBeNull()
  })
})

describe('anything unrecognised is a defect, not a guess', () => {
  test('an error nobody registered answers null', () => {
    expect(constraintRefusal(TABLE, new Error('database is locked'))).toBeNull()
  })

  test('an empty table always answers null', () => {
    expect(constraintRefusal([], new Error('UNIQUE constraint failed: shifts.performance_id'))).toBeNull()
  })

  test('a thrown value that is not an Error is stringified rather than crashing', () => {
    expect(constraintRefusal(TABLE, 'UNIQUE constraint failed: shifts.performance_id')?.statusCode).toBe(409)
  })

  test('two modules never see each other\'s tables', () => {
    const barTable: ConstraintRefusal[] = [{ violated: 'stock_movements.id', says: 'That movement is already recorded' }]
    expect(constraintRefusal(barTable, new Error('UNIQUE constraint failed: shifts.performance_id'))).toBeNull()
  })
})
