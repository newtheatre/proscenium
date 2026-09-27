import { describe, expect, test } from 'bun:test'
import { LINE_KINDS } from '#shared/utils/ledger'
import { entriesHref, ledgerEntriesList, saysEntryWhat } from '#shared/utils/ledger-entries-list'
import { filterQuerySchema } from '#shared/utils/list-filters'

// Issue 1361: a ledger entry says what it was, is filtered and searched by it, and every money
// dashboard figure drills down to the entries it is made of (I-101, I-105 criterion 3, K-129).

describe('what an entry was, in words', () => {
  test('its kinds, how many items and its show', () => {
    expect(saysEntryWhat({ kinds: 'REFUND', items: 1, showTitle: 'Hamlet' })).toBe('Refund, Hamlet')
    expect(saysEntryWhat({ kinds: 'BAR_ITEM', items: 3, showTitle: null })).toBe('Bar item (3 items)')
    expect(saysEntryWhat({ kinds: 'TICKET_COLLECTION', items: 2, showTitle: 'Hamlet' })).toBe('Ticket collection (2 items), Hamlet')
  })

  test('two kinds read in the order the ledger lists them, joined in words', () => {
    expect(saysEntryWhat({ kinds: 'TAB_SETTLEMENT,BAR_ITEM', items: 2, showTitle: null })).toBe('Bar item and Tab settlement (2 items)')
  })

  test('an entry with no lines says so rather than printing nothing', () => {
    expect(saysEntryWhat({ kinds: null, items: 0, showTitle: null })).toBe('No lines')
  })
})

describe('the entries list is filtered by what an entry was', () => {
  const schema = filterQuerySchema(ledgerEntriesList)

  test('kind offers every line kind, in words, and takes is, is not and any of', () => {
    const kind = ledgerEntriesList.fields.find(field => field.key === 'kind')
    expect(kind?.options?.map(option => option.value)).toEqual(LINE_KINDS.map(line => line.name))
    expect(kind?.options?.every(option => !option.label.includes('_'))).toBe(true)
    expect(schema.safeParse({ kind: 'any:REFUND,BAR_ITEM' }).success).toBe(true)
    expect(schema.safeParse({ kind: 'is:NOT_A_KIND' }).success).toBe(false)
  })

  test('discounted is a yes or no', () => {
    expect(schema.safeParse({ discounted: 'true' }).success).toBe(true)
  })

  test('the search box says what it finds', () => {
    expect(ledgerEntriesList.search?.placeholder).toMatch(/booking reference/i)
  })
})

describe('every dashboard figure drills down to its entries', () => {
  const range = { fromDay: '2026-09-01', toDay: '2026-09-30' }

  test('a range reads as the when filter, and a single day as that day', () => {
    expect(entriesHref(range)).toBe('/money/entries?happenedAt=between%3A2026-09-01%2C2026-09-30')
    expect(entriesHref({ fromDay: '2026-09-15', toDay: '2026-09-15' })).toBe('/money/entries?happenedAt=2026-09-15')
  })

  test('each figure carries the filters its own query uses', () => {
    expect(entriesHref(range, { source: 'DESK', tender: 'CARD' })).toContain('source=DESK&tender=CARD')
    expect(entriesHref(range, { kind: 'REFUND', tender: 'CARD' })).toContain('tender=CARD&kind=REFUND')
    expect(entriesHref(range, { tender: 'COMP' })).toContain('tender=COMP')
    expect(entriesHref(range, { discounted: true })).toContain('discounted=true')
  })
})
