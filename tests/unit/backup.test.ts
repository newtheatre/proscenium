import { describe, expect, test } from 'bun:test'
import { isDrillOverdue, restoreDrillForm } from '#shared/utils/backup'

// K-108 and J-107: the termly restore drill. Not "per term": no term dates exist anywhere in
// the system (0034), so the cadence is a configured interval, exactly like the booking horizon.

describe('a drill\'s outcome is recorded, not merely claimed (K-108 criterion 3, J-107 criterion 3)', () => {
  test('a passing drill with what it reconciled parses', () => {
    const parsed = restoreDrillForm.parse({
      ranAt: '2026-09-10',
      outcome: 'PASS',
      timeToRestoreMinutes: 42,
      rowCountsMatch: true,
      moneyTotalsMatch: true,
    })
    expect(parsed.outcome).toBe('PASS')
  })

  // A failed drill still measured what it reconciled: that is the finding, not a reason to omit it.
  test('a failed drill still records what it did and did not reconcile', () => {
    const parsed = restoreDrillForm.parse({
      ranAt: '2026-09-10',
      outcome: 'FAIL',
      timeToRestoreMinutes: 90,
      rowCountsMatch: true,
      moneyTotalsMatch: false,
      notes: 'Z-reading total was short by one bar session',
    })
    expect(parsed.moneyTotalsMatch).toBe(false)
  })

  test('an outcome the estate does not use is refused', () => {
    expect(() => restoreDrillForm.parse({
      ranAt: '2026-09-10', outcome: 'PARTIAL', timeToRestoreMinutes: 10, rowCountsMatch: true, moneyTotalsMatch: true,
    })).toThrow()
  })

  test('a negative or zero time to restore is refused', () => {
    expect(() => restoreDrillForm.parse({
      ranAt: '2026-09-10', outcome: 'PASS', timeToRestoreMinutes: 0, rowCountsMatch: true, moneyTotalsMatch: true,
    })).toThrow()
  })

  test('notes are optional, so a clean pass does not have to invent a comment', () => {
    const parsed = restoreDrillForm.parse({
      ranAt: '2026-09-10', outcome: 'PASS', timeToRestoreMinutes: 15, rowCountsMatch: true, moneyTotalsMatch: true,
    })
    expect(parsed.notes).toBeUndefined()
  })
})

describe('a missed drill stays visible rather than passing silently (J-107 criterion 4)', () => {
  test('no drill ever run is always overdue, once a cadence is configured', () => {
    expect(isDrillOverdue(null, 120, '2026-09-10')).toBe(true)
  })

  test('a drill inside the configured interval is not overdue', () => {
    expect(isDrillOverdue('2026-08-01', 120, '2026-09-10')).toBe(false)
  })

  test('a drill older than the configured interval is overdue', () => {
    expect(isDrillOverdue('2026-01-01', 120, '2026-09-10')).toBe(true)
  })

  // No proposed value exists yet (0019, J-104): the dashboard cannot flag a policy nobody has
  // set, so an unconfigured cadence never reads as overdue rather than guessing one.
  test('with no interval configured, nothing is ever flagged overdue', () => {
    expect(isDrillOverdue(null, null, '2026-09-10')).toBe(false)
    expect(isDrillOverdue('2020-01-01', null, '2026-09-10')).toBe(false)
  })
})
