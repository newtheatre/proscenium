import { describe, expect, test } from 'bun:test'
import { exportRangeForm, formatPoundsForExport, LEDGER_POSTING_PAIRS, nominalMappingForm, SU_EXPORT_CARD_TOTAL, SU_EXPORT_ROW_CAP, suExportCapRefusal, suExportCsvRows, suExportForm, suExportLines } from '#shared/utils/su-export'
import { periodQuery } from '#shared/utils/season-dashboard'
import { ENTRY_SOURCES, isLineKind } from '#shared/utils/ledger'
import type { SuExportRow } from '#shared/utils/su-export'

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

// Issue #1283: a pair posted with no row exports UNMAPPED forever, since a mapping is only ever
// updated. A file's every ledger source is paired with its every line kind, erring towards a row.
describe('every pair the code posts under has a mapping row (I-108 criterion 1)', () => {
  const listed = new Set(LEDGER_POSTING_PAIRS.map(pair => `${pair.kind}/${pair.source}`))
  const literals = (text: string): string[] => [...text.matchAll(/'([A-Z_]+)'/g)].map(match => match[1]!)
  const tokens = (cell: string): string[] => [...cell.matchAll(/`([A-Z_]+)`/g)].map(match => match[1]!)
  // The helper every caller posts through writes whatever kind and source it is handed.
  const postingHelper = 'server/utils/ledger.ts'

  async function postingFiles(): Promise<{ file: string, text: string }[]> {
    const found: { file: string, text: string }[] = []
    for (const dir of ['server', 'migration']) {
      for (const entry of new Bun.Glob('**/*.ts').scanSync({ cwd: dir, onlyFiles: true })) {
        const file = `${dir}/${entry}`
        if (file === postingHelper) continue
        const text = await Bun.file(file).text()
        if (/\bpostEntry\(\{|INTO ledger_entries/.test(text)) found.push({ file, text })
      }
    }
    return found
  }

  function pairsIn(text: string): { sources: string[], kinds: string[] } {
    const sources = [...text.matchAll(/\bsource:([^,\n]+)/g)].flatMap(match => literals(match[1]!))
      .filter(source => (ENTRY_SOURCES as readonly string[]).includes(source))
    const kinds = [...text.matchAll(/\bkind:\s*'([A-Z_]+)'/g)].map(match => match[1]!).filter(isLineKind)
    return { sources: [...new Set(sources)], kinds: [...new Set(kinds)] }
  }

  test('the scan finds the posting sites, and reads a source and a kind in each', async () => {
    const files = await postingFiles()
    expect(files.map(one => one.file)).toContain('server/utils/sale.ts')
    expect(files.map(one => one.file)).toContain('server/utils/fellowship-pass.ts')
    expect(files.map(one => one.file)).toContain('migration/money.ts')
    for (const { file, text } of files) {
      const { sources, kinds } = pairsIn(text)
      expect(`${file}: ${sources.length > 0 && kinds.length > 0}`).toBe(`${file}: true`)
    }
  })

  test('every (kind, source) a posting site writes is in LEDGER_POSTING_PAIRS', async () => {
    const missing: string[] = []
    for (const { file, text } of await postingFiles()) {
      const { sources, kinds } = pairsIn(text)
      for (const kind of kinds) {
        for (const source of sources) {
          if (!listed.has(`${kind}/${source}`)) missing.push(`${kind}/${source} (${file})`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  test('the till\'s ticket lines and the Fellowship award are mappable (issue #1283)', () => {
    for (const pair of ['TICKET_COLLECTION/TILL', 'WALK_UP/TILL', 'PASS_SALE/SYSTEM']) {
      expect(`${pair}: ${listed.has(pair)}`).toBe(`${pair}: true`)
    }
  })

  test('the list is exactly the pairs architecture.md\'s posting table names', async () => {
    const doc = await Bun.file('docs/architecture.md').text()
    const section = doc.split('\n### The money paths\n')[1]?.split('\n## ')[0] ?? ''
    const documented = new Set<string>()
    for (const row of section.split('\n').filter(one => one.startsWith('| ') && !one.startsWith('| Money path') && !one.startsWith('| ---'))) {
      const [, , , sources, , kinds] = row.split('|').slice(1, -1).map(cell => cell.trim())
      for (const kind of tokens(kinds!)) {
        for (const source of tokens(sources!)) documented.add(`${kind}/${source}`)
      }
    }
    expect([...listed].sort()).toEqual([...documented].sort())
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

describe('choosing the period by name: a year, a season or a custom range (criterion 4, 0087)', () => {
  test('a custom range is the shared TERM kind, so every period screen writes the same link', () => {
    expect(suExportForm.parse({ kind: 'TERM', fromDay: '2026-09-01', toDay: '2026-09-30' })).toEqual({ kind: 'TERM', fromDay: '2026-09-01', toDay: '2026-09-30' })
  })

  test.each([
    { name: 'no kind', query: { fromDay: '2026-09-01', toDay: '2026-09-30' } },
    { name: 'kind=RANGE', query: { kind: 'RANGE', fromDay: '2026-09-01', toDay: '2026-09-30' } },
  ])('an older link with $name still reads as the same custom range', ({ query }) => {
    expect(suExportForm.parse(query)).toEqual({ kind: 'TERM', fromDay: '2026-09-01', toDay: '2026-09-30' })
  })

  test.each([
    { kind: 'TERM', fromDay: '2026-09-30', toDay: '2026-09-01' },
    { kind: 'RANGE', fromDay: '2026-09-30', toDay: '2026-09-01' },
    { fromDay: '2026-09-30', toDay: '2026-09-01' },
  ])('a custom range ending before it starts is refused on the to day ($kind)', (query) => {
    const parsed = suExportForm.safeParse(query)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path).toEqual(['toDay'])
    expect(parsed.error?.issues[0]?.message).toBe('The range ends before it starts')
  })

  test('a kind the export does not offer is refused rather than read as a range', () => {
    expect(suExportForm.safeParse({ kind: 'MONTH', year: '2026', month: '9' }).success).toBe(false)
  })

  test('a year is named by the year it ends in, read from the query string as text', () => {
    expect(suExportForm.parse({ kind: 'YEAR', year: '2026' })).toEqual({ kind: 'YEAR', year: 2026 })
  })

  test('a season is sent by its id, never by its days', () => {
    expect(suExportForm.parse({ kind: 'SEASON', seasonId: 'season-1', fromDay: '2026-01-01' })).toEqual({ kind: 'SEASON', seasonId: 'season-1' })
    expect(suExportForm.safeParse({ kind: 'SEASON', seasonId: ' ' }).success).toBe(false)
  })

  test('the whole year asked for as a season is refused rather than read as a year (0087)', () => {
    expect(suExportForm.safeParse({ kind: 'SEASON', year: '2026' }).success).toBe(false)
  })

  test.each([
    { kind: 'YEAR', year: 2026 },
    { kind: 'SEASON', seasonId: 'season-1' },
    { kind: 'TERM', fromDay: '2026-09-01', toDay: '2026-09-30' },
  ] as const)('the shared period query the download and its status send reads back as the same period ($kind)', (period) => {
    expect(suExportForm.parse(periodQuery(period))).toEqual(period)
  })
})

describe('the file itself (criteria 2, 3, 4)', () => {
  const lines: SuExportRow[] = [
    { londonDay: '2026-09-15', kind: 'WALK_UP', source: 'DESK', tender: 'CARD', nominalCode: '4100', amountPence: 900 },
    { londonDay: '2026-09-16', kind: 'BAR_ITEM', source: 'TILL', tender: 'CARD', nominalCode: null, amountPence: -500 },
  ]

  test('each line is date, category, tender, code or UNMAPPED, pence and pounds, in that order', () => {
    const shaped = suExportCsvRows(lines)
    expect(shaped.slice(0, 2)).toEqual([
      { date: '2026-09-15', category: 'Walk-up sale', tender: 'Card', nominalCode: '4100', amountPence: 900, amountPounds: '9.00' },
      { date: '2026-09-16', category: 'Bar item', tender: 'Card', nominalCode: 'UNMAPPED', amountPence: -500, amountPounds: '-5.00' },
    ])
    expect(Object.keys(shaped[0]!)).toEqual(['date', 'category', 'tender', 'nominalCode', 'amountPence', 'amountPounds'])
  })

  // Issue #1363: a drink on a tab is a line when charged and another when settled, so the charge
  // says it was credit and the closing line totals only the card money, the dashboard's revenue.
  test('a drink charged to a tab says so, and is not card money', () => {
    const shaped = suExportCsvRows([
      { londonDay: '2026-09-20', kind: 'BAR_ITEM', source: 'TILL', tender: 'TAB', nominalCode: null, amountPence: 600 },
      { londonDay: '2026-09-23', kind: 'TAB_SETTLEMENT', source: 'TILL', tender: 'CARD', nominalCode: null, amountPence: 600 },
      { londonDay: '2026-09-23', kind: 'BAR_ITEM', source: 'TILL', tender: 'COMP', nominalCode: null, amountPence: 0 },
    ])
    expect(shaped[0]).toMatchObject({ category: 'Bar item on a tab', tender: 'Tab', amountPence: 600 })
    expect(shaped[1]).toMatchObject({ category: 'Tab settlement', tender: 'Card', amountPence: 600 })
    expect(shaped[2]).toMatchObject({ category: 'Bar item', tender: 'Comp', amountPence: 0 })
    expect(shaped.at(-1)).toEqual({ date: '', category: SU_EXPORT_CARD_TOTAL, tender: '', nominalCode: '', amountPence: 600, amountPounds: '6.00' })
  })

  test('the closing line is always there, the card lines summed with their signs', () => {
    expect(suExportCsvRows(lines).at(-1)).toMatchObject({ category: SU_EXPORT_CARD_TOTAL, amountPence: 400, amountPounds: '4.00' })
    expect(suExportCsvRows([])).toEqual([
      { date: '', category: SU_EXPORT_CARD_TOTAL, tender: '', nominalCode: '', amountPence: 0, amountPounds: '0.00' },
    ])
    expect(SU_EXPORT_CARD_TOTAL).toBe('Card total, the same as the money dashboard\'s revenue')
  })

  test('the cap refusal names the cap, the same sentence the download refuses with', () => {
    expect(suExportCapRefusal()).toBe(`This export would return more than ${SU_EXPORT_ROW_CAP.toLocaleString('en-GB')} rows. Narrow the date range and try again.`)
  })

  test('the coverage line counts in British digits and agrees in number', () => {
    expect(suExportLines(1)).toBe('1 line')
    expect(suExportLines(0)).toBe('0 lines')
    expect(suExportLines(12345)).toBe('12,345 lines')
  })
})
