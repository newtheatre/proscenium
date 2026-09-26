import { describe, expect, test } from 'bun:test'
import { nightsWithTakings, outstandingNights, zReadingStatement } from '#server/utils/night-reconciliation'
import { fromLondonWallClock } from '#shared/utils/london'
import { recordZReadingForm } from '#shared/utils/night-reconciliation'
import { FIRST_RECONCILED_NIGHT } from '#shared/utils/show-night'

// I-104: the reader keys in what it shows; a variance needs a note before it can be recorded,
// and a write-off names what it resolves.

describe('a Z reading takes a night and what the reader showed', () => {
  test('a plain reading needs no note', () => {
    expect(recordZReadingForm.safeParse({ night: '2026-09-15', readerPence: 5000 }).success).toBe(true)
  })

  test('a night that is not YYYY-MM-DD is refused', () => {
    expect(recordZReadingForm.safeParse({ night: '15 Sept 2026', readerPence: 5000 }).success).toBe(false)
  })

  test('a negative reader figure is refused: the reader never shows less than nothing', () => {
    expect(recordZReadingForm.safeParse({ night: '2026-09-15', readerPence: -100 }).success).toBe(false)
  })

  test('writtenOff defaults to false', () => {
    const parsed = recordZReadingForm.safeParse({ night: '2026-09-15', readerPence: 5000 })
    expect(parsed.success && parsed.data.writtenOff).toBe(false)
  })

  test('a resolving reading names what it resolves', () => {
    expect(recordZReadingForm.safeParse({
      night: '2026-09-15', readerPence: 5000, supersedesId: 'z-1', note: 'Corrected mistyped figure',
    }).success).toBe(true)
  })
})

// K-128 criterion 2, item 6. Every sibling refusal formats money through `saysMoney`; this one
// printed raw pence and said "the ledger expects", which narrates the machine at the reader.
describe('a variance with no note is refused in money, not in pence', () => {
  const reading = { night: '2026-09-15', readerPence: 5000, writtenOff: false }

  function refusalFor(readerPence: number, expectedPence: number): string {
    try {
      zReadingStatement({ ...reading, readerPence }, 'u-1', expectedPence)
    }
    catch (error) {
      return (error as { statusMessage?: string }).statusMessage ?? ''
    }
    return ''
  }

  test('both figures read as money and the theatre says "we"', () => {
    expect(refusalFor(5000, 4200))
      .toBe('The reader read £50.00; we expect £42.00. That difference needs a note before it can be recorded.')
  })

  test('neither a bare pence figure nor the ledger is named', () => {
    const said = refusalFor(125, 0)
    expect(said).toContain('£1.25')
    expect(said).toContain('£0.00')
    expect(said).not.toContain('pence')
    expect(said).not.toContain('ledger')
  })

  test('a reading that matches is not refused at all', () => {
    expect(refusalFor(4200, 4200)).toBe('')
  })
})

describe('only nights since the first reconciled night are outstanding (criterion 5, issue 1208)', () => {
  const TONIGHT = '2026-09-22'

  test('the first reconciled night is 1 September 2026', () => {
    expect(FIRST_RECONCILED_NIGHT).toBe('2026-09-01')
  })

  test('imported history before the floor never needs a reading', () => {
    const ran = ['2014-10-03', '2025-06-14', '2026-08-31', '2026-09-01', '2026-09-15']
    expect(outstandingNights(ran, new Set(), TONIGHT)).toEqual([{ night: '2026-09-01' }, { night: '2026-09-15' }])
  })

  test('a night with a reading, or not yet begun, is not outstanding', () => {
    const ran = ['2026-09-15', '2026-09-20', '2026-09-22', '2026-09-23']
    expect(outstandingNights(ran, new Set(['2026-09-20']), TONIGHT)).toEqual([{ night: '2026-09-15' }, { night: '2026-09-22' }])
  })

  test('the list is sorted and never truncated', () => {
    const ran = Array.from({ length: 22 }, (_, index) => `2026-09-${String(22 - index).padStart(2, '0')}`)
    const listed = outstandingNights(ran, new Set(), TONIGHT).map(row => row.night)
    expect(listed).toHaveLength(22)
    expect(listed).toEqual([...listed].sort())
  })
})

// Issue #1359: a London day's first and last takings name the show nights it holds money for,
// since the night runs 04:00 to 04:00 (0014) and the ledger groups by calendar day.
describe('the nights a London day of takings belongs to', () => {
  const at = (day: string, hour: number, minute = 0): number => {
    const [year, month, date] = day.split('-').map(Number) as [number, number, number]
    return Math.floor(fromLondonWallClock(year, month, date, hour, minute).getTime() / 1000)
  }

  test('takings after 04:00 are that night\'s', () => {
    expect(nightsWithTakings([{ firstAt: at('2026-09-05', 14), lastAt: at('2026-09-05', 23) }])).toEqual(['2026-09-05'])
  })

  test('takings before 04:00 are the night before\'s', () => {
    expect(nightsWithTakings([{ firstAt: at('2026-09-24', 0), lastAt: at('2026-09-24', 3) }])).toEqual(['2026-09-23'])
  })

  test('a day with both is money for two nights, and a night is named once', () => {
    expect(nightsWithTakings([
      { firstAt: at('2026-09-23', 20), lastAt: at('2026-09-23', 22) },
      { firstAt: at('2026-09-24', 1), lastAt: at('2026-09-24', 19) },
    ])).toEqual(['2026-09-23', '2026-09-24'])
  })

  test('the boundary is 04:00 London on both clock-change days', () => {
    expect(nightsWithTakings([{ firstAt: at('2026-10-25', 3, 59), lastAt: at('2026-10-25', 4) }])).toEqual(['2026-10-24', '2026-10-25'])
    expect(nightsWithTakings([{ firstAt: at('2026-03-29', 3, 59), lastAt: at('2026-03-29', 4) }])).toEqual(['2026-03-28', '2026-03-29'])
  })
})
