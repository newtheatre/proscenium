import { describe, expect, test } from 'bun:test'
import { exportRangeForm, formatPoundsForExport, LEDGER_POSTING_PAIRS, nominalMappingForm, SU_EXPORT_ROW_CAP } from '#shared/utils/su-export'

describe('mapping a (kind, source) pair to a nominal code (I-108 criterion 1)', () => {
  test('a known pair with a code is accepted', () => {
    expect(nominalMappingForm.safeParse({ kind: 'TICKET_COLLECTION', source: 'DESK', nominalCode: '4100' }).success).toBe(true)
  })

  test('clearing back to unmapped is an explicit null, not an empty string', () => {
    expect(nominalMappingForm.safeParse({ kind: 'TICKET_COLLECTION', source: 'DESK', nominalCode: null }).success).toBe(true)
    expect(nominalMappingForm.safeParse({ kind: 'TICKET_COLLECTION', source: 'DESK', nominalCode: '' }).success).toBe(false)
  })

  test('a pair no ledger line ever posts under is refused', () => {
    expect(nominalMappingForm.safeParse({ kind: 'BAR_ITEM', source: 'DESK', nominalCode: '4100' }).success).toBe(false)
  })

  test('every posting pair is itself accepted', () => {
    for (const pair of LEDGER_POSTING_PAIRS) {
      expect(nominalMappingForm.safeParse({ ...pair, nominalCode: '4100' }).success).toBe(true)
    }
  })
})

describe('a period export range', () => {
  test('a well-formed range is accepted', () => {
    expect(exportRangeForm.safeParse({ fromDay: '2026-09-01', toDay: '2026-09-30' }).success).toBe(true)
  })

  test('a range ending before it starts is refused', () => {
    expect(exportRangeForm.safeParse({ fromDay: '2026-09-30', toDay: '2026-09-01' }).success).toBe(false)
  })

  test('a single-day range is valid', () => {
    expect(exportRangeForm.safeParse({ fromDay: '2026-09-01', toDay: '2026-09-01' }).success).toBe(true)
  })
})

describe('the pounds column, formatted at export time only (criterion 2)', () => {
  test('pence renders as a plain decimal, no currency symbol', () => {
    expect(formatPoundsForExport(1234)).toBe('12.34')
    expect(formatPoundsForExport(0)).toBe('0.00')
  })

  test('a refund line, negative in the ledger, stays negative in pounds', () => {
    expect(formatPoundsForExport(-500)).toBe('-5.00')
  })
})

test('the row cap is a structural bound, not a policy one (0012)', () => {
  expect(SU_EXPORT_ROW_CAP).toBeGreaterThan(0)
})
