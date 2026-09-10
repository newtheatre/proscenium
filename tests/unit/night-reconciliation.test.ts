import { describe, expect, test } from 'bun:test'
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
