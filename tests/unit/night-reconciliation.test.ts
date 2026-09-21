import { describe, expect, test } from 'bun:test'
import { zReadingStatement } from '#server/utils/night-reconciliation'
import { recordZReadingForm } from '#shared/utils/night-reconciliation'

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
