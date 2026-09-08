import { describe, expect, test } from 'bun:test'
import { transformMoney } from '#migration/money'
import type { TicketRow } from '#migration/money'

// K-114, I-109: the pure transform, tickets in and ledger rows out, no database needed.

function ticket(over: Partial<TicketRow> = {}): TicketRow {
  return {
    id: 'ticket-1',
    price_paid: 1250,
    refunded_at: null,
    created_at: '2023-05-14 19:30:00',
    price_confidence: 'EXACT',
    ...over,
  }
}

describe('a sold ticket becomes one ledger entry and one line', () => {
  test('the amounts, the source, the tender and the kind all match the money-path contract', () => {
    const { entries, lines, summary } = transformMoney([ticket()], new Map(), new Map())

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ source: 'IMPORT', tender: 'CARD', total_pence: 1250, reverses_entry_id: null })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ kind: 'IMPORT', amount_pence: 1250, qty: 1 })
    expect(summary).toMatchObject({ tickets: 1, sold: 1, refunded: 0, salesPence: 1250, refundsPence: 0, netPence: 1250 })
  })

  // 0033: IMPORT tenders NONE where the old estate recorded none. A free ticket is exactly that.
  test('a zero-price ticket tenders NONE, not CARD', () => {
    const { entries } = transformMoney([ticket({ price_paid: 0 })], new Map(), new Map())
    expect(entries[0]!.tender).toBe('NONE')
  })

  test('the London day comes from the original sale instant, in London time', () => {
    const { entries } = transformMoney([ticket({ created_at: '2023-07-14 23:30:00' })], new Map(), new Map())
    // BST is UTC+1 in July, so 23:30 UTC is already gone midnight in London.
    expect(entries[0]!.london_day).toBe('2023-07-15')
  })
})

describe('a refund becomes a second, reversing entry (K-114, I-109)', () => {
  test('the reversal negates the sale and names it in reverses_entry_id', () => {
    const { entries, summary } = transformMoney(
      [ticket({ refunded_at: 1_700_000_000_000 })], new Map(), new Map(),
    )

    expect(entries).toHaveLength(2)
    const [sale, refund] = entries
    expect(refund!.total_pence).toBe(-1250)
    expect(refund!.reverses_entry_id).toBe(sale!.id)
    expect(summary).toMatchObject({ sold: 1, refunded: 1, salesPence: 1250, refundsPence: 1250, netPence: 0 })
  })

  // The old estate's own convention bookings.ts already found: an integer timestamp this large
  // can only be milliseconds. A unit error would date every refund in 1970.
  test('refunded_at is read as milliseconds, matching the old estate elsewhere', () => {
    const { entries } = transformMoney([ticket({ refunded_at: 1_700_000_000_000 })], new Map(), new Map())
    const refund = entries[1]!
    expect(refund.happened_at).toBe(1_700_000_000)
  })
})

describe('re-running over the same tickets writes nothing further (rehearsal safety)', () => {
  test('the same ticket keeps the same entry id across two runs', () => {
    const idMap = new Map<string, string>()
    const refundIdMap = new Map<string, string>()

    const first = transformMoney([ticket()], idMap, refundIdMap)
    const second = transformMoney([ticket()], idMap, refundIdMap)

    expect(second.entries[0]!.id).toBe(first.entries[0]!.id)
  })
})

describe('a price the old estate itself was not sure of is imported, not silenced (K-114 criterion 1)', () => {
  test('a non-EXACT confidence still posts the money, and surfaces as an exception', () => {
    const { entries, exceptions } = transformMoney(
      [ticket({ price_confidence: 'ESTIMATED' })], new Map(), new Map(),
    )

    expect(entries).toHaveLength(1)
    expect(exceptions.some(line => line.includes('ESTIMATED'))).toBe(true)
  })

  test('an EXACT confidence raises no exception', () => {
    const { exceptions } = transformMoney([ticket()], new Map(), new Map())
    expect(exceptions).toEqual([])
  })
})

describe('a ticket whose date will not parse is named in the exceptions report, not guessed', () => {
  test('it is skipped rather than imported with an invented date', () => {
    const { entries, exceptions } = transformMoney(
      [ticket({ created_at: 'not-a-date' })], new Map(), new Map(),
    )
    expect(entries).toEqual([])
    expect(exceptions.some(line => line.includes('ticket-1'))).toBe(true)
  })
})
