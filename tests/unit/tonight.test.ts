import { describe, expect, test } from 'bun:test'
import { readTeamRow } from '#server/utils/tonight'
import { activePerformanceId, contactRoster, saysPerformanceChoice, saysTeamHolder, telHref } from '#shared/utils/tonight'
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

  test('a claimed but unconfirmed shift is not filled: it names the claimant as claimed (issue 1303)', () => {
    expect(readTeamRow(row('CLAIMED'))).toMatchObject({ filled: false, claimed: true, name: 'Someone' })
    expect(readTeamRow(row('CONFIRMED'))).toMatchObject({ filled: true, claimed: false })
  })

  test('open, declined shows as unfilled, with no name', () => {
    expect(readTeamRow(row('OPEN', { userId: null, name: null, phone: null, visible: null }))).toMatchObject({ filled: false, claimed: false, name: null })
    expect(readTeamRow(row('DECLINED'))).toMatchObject({ filled: false, claimed: false, name: null })
  })
})

describe('a slot reads as its holder, a claim or a gap (E-112 criterion 2, issue 1303)', () => {
  test('confirmed reads as the name, a claim says it is not confirmed, and a gap is unfilled', () => {
    expect(saysTeamHolder({ filled: true, claimed: false, name: 'Tomasz Nowak' })).toBe('Tomasz Nowak')
    expect(saysTeamHolder({ filled: false, claimed: true, name: 'Tomasz Nowak' })).toBe('Tomasz Nowak, claimed, not confirmed')
    expect(saysTeamHolder({ filled: false, claimed: false, name: null })).toBe('Unfilled')
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

  test('never a phone for a claim waiting to be confirmed, consent or not', () => {
    expect(readTeamRow(row('CLAIMED', { visible: 1 }))?.phone).toBeNull()
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

describe('a picker names the performance rather than its id (issue 901)', () => {
  // 2026-09-11T20:31Z is 21:31 in London, the seeded pair's own curtain.
  const startsAt = Math.floor(Date.UTC(2026, 8, 11, 20, 31) / 1000)

  test('the title and the curtain time, in the London wall clock', () => {
    expect(saysPerformanceChoice({ showTitle: 'The Seagull', startsAt })).toBe('The Seagull, 21:31')
  })

  test('a winter curtain reads in GMT, not in the summer offset', () => {
    const winter = Math.floor(Date.UTC(2026, 11, 5, 19, 30) / 1000)
    expect(saysPerformanceChoice({ showTitle: 'Machinal', startsAt: winter })).toBe('Machinal, 19:30')
  })
})

describe('who is on tonight, for the contacts block (E-112 criterion 2)', () => {
  const slot = (role: 'DUTY_MANAGER' | 'DOOR' | 'BAR', name: string | null, phone: string | null) =>
    ({ role, filled: name !== null, claimed: false, name, phone })

  test('the duty manager leads, then the door, then the bar', () => {
    const listed = contactRoster([slot('BAR', 'Friar Tuck', null), slot('DOOR', 'Little John', null), slot('DUTY_MANAGER', 'Maid Marian', null)])
    expect(listed.map(one => one.role)).toEqual(['DUTY_MANAGER', 'DOOR', 'BAR'])
  })

  test('the same person on two performances is one row', () => {
    const listed = contactRoster([slot('DOOR', 'Little John', null), slot('DOOR', 'Little John', null)])
    expect(listed).toHaveLength(1)
  })

  test('a row carrying the consented number wins over one that does not', () => {
    const listed = contactRoster([slot('DOOR', 'Little John', null), slot('DOOR', 'Little John', '07700 900123')])
    expect(listed[0]?.phone).toBe('07700 900123')
  })

  test('a claim is its own row, never folded into a gap or into the same person confirmed', () => {
    const claim = { role: 'DOOR' as const, filled: false, claimed: true, name: 'Little John', phone: null }
    const listed = contactRoster([slot('DOOR', null, null), claim, slot('DOOR', 'Little John', null)])
    expect(listed.map(one => [one.filled, one.claimed])).toEqual([[false, false], [false, true], [true, false]])
  })

  test('an unfilled slot stays in the list as unfilled, never as a blank name', () => {
    const listed = contactRoster([slot('BAR', null, null), slot('DUTY_MANAGER', 'Maid Marian', null)])
    expect(listed.map(one => one.filled)).toEqual([true, false])
    expect(listed[1]?.name).toBeNull()
  })

  test('a number dials without its spacing', () => {
    expect(telHref('07700 900 123')).toBe('tel:07700900123')
    expect(telHref('+44 7700 900123')).toBe('tel:+447700900123')
  })
})
