import { describe, expect, test } from 'bun:test'
import { readTeamRow } from '#server/utils/tonight'
import { activePerformanceId } from '#shared/utils/tonight'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'

// The duty manager's tonight screen (E-112). What the database returns is proved against the
// real migrations in `tests/integration/tonight.test.ts`; this is the pure read of one row.

const row = (status: ShiftStatus, overrides: Partial<{ userId: string | null, name: string | null, phone: string | null, visible: number | null }> = {}) => ({
  shiftId: 'shift-1',
  role: 'DOOR' as ShiftRole,
  status,
  userId: 'user-1',
  name: 'Someone',
  phone: '07700 900000',
  visible: 1,
  ...overrides,
})

describe('an unfilled slot never shows a blank name (E-112 criterion 2)', () => {
  test('a confirmed shift is filled, with the name shown', () => {
    expect(readTeamRow(row('CONFIRMED'))).toMatchObject({ filled: true, name: 'Someone' })
  })

  test('a claimed but unconfirmed shift is filled too', () => {
    expect(readTeamRow(row('CLAIMED'))).toMatchObject({ filled: true, name: 'Someone' })
  })

  test('open, declined shows as unfilled, with no name', () => {
    expect(readTeamRow(row('OPEN', { userId: null, name: null, phone: null, visible: null }))).toMatchObject({ filled: false, name: null })
    expect(readTeamRow(row('DECLINED'))).toMatchObject({ filled: false, name: null })
  })
})

describe('the phone shows only where consent is currently set', () => {
  test('consented and filled: the phone shows', () => {
    expect(readTeamRow(row('CONFIRMED', { visible: 1 }))?.phone).toBe('07700 900000')
  })

  test('filled but not consented: no phone', () => {
    expect(readTeamRow(row('CONFIRMED', { visible: 0 }))?.phone).toBeNull()
  })

  test('never a phone for an unfilled slot, even if the column carries one', () => {
    expect(readTeamRow(row('DECLINED', { visible: 1 }))?.phone).toBeNull()
  })
})

describe('which performance is active, one venue running more than one today (E-127 criterion 2)', () => {
  const matinee = { performanceId: 'matinee', startsAt: 1000, doorsAt: 900 }
  const evening = { performanceId: 'evening', startsAt: 5000, doorsAt: 4800 }

  test('before the first door, the first performance is active: the next one to come', () => {
    expect(activePerformanceId([matinee, evening], 500)).toBe('matinee')
  })

  test('inside the matinee\'s own window, the matinee is active', () => {
    expect(activePerformanceId([matinee, evening], 1200)).toBe('matinee')
  })

  test('between the matinee and the evening\'s door, the matinee stays active', () => {
    expect(activePerformanceId([matinee, evening], 3000)).toBe('matinee')
  })

  test('from the evening\'s own door onward, the evening is active', () => {
    expect(activePerformanceId([matinee, evening], 4800)).toBe('evening')
    expect(activePerformanceId([matinee, evening], 6000)).toBe('evening')
  })

  test('order in the input never matters, only the clock', () => {
    expect(activePerformanceId([evening, matinee], 1200)).toBe('matinee')
  })

  test('a performance with no doors set falls back to its curtain', () => {
    const noDoors = { performanceId: 'no-doors', startsAt: 2000, doorsAt: null }
    expect(activePerformanceId([noDoors], 1999)).toBe('no-doors')
  })

  test('nothing running tonight answers nothing, not a guess', () => {
    expect(activePerformanceId([], 1000)).toBeNull()
  })
})
