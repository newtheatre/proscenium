import { describe, expect, test } from 'bun:test'
import { csvField, toCsv } from '#server/utils/csv'

// D-129 criterion 2: a cell Excel or Google Sheets would read as a formula is guarded on the way
// out, in the one place every CSV export writes through.

describe('csvField guards a leading =, +, - or @ (D-129 criterion 2)', () => {
  test.each(['=', '+', '-', '@'])('a value starting %s is prefixed so it reads as text, not a formula', (prefix) => {
    const value = `${prefix}cmd|' /C calc'!A0`
    expect(csvField(value)).toBe(`"'${value}"`)
  })

  test('a value with none of the four leading characters is untouched but still quoted', () => {
    expect(csvField('Standard')).toBe('"Standard"')
  })

  test('the guard only looks at the first character: one in the middle is not a formula', () => {
    expect(csvField('A - B')).toBe('"A - B"')
  })

  test('an inner quote is doubled, per RFC 4180', () => {
    expect(csvField('6" heels')).toBe('"6"" heels"')
  })

  test('null and undefined both read as an empty, still-quoted cell', () => {
    expect(csvField(null)).toBe('""')
    expect(csvField(undefined)).toBe('""')
  })

  test('a number is stringified before the guard runs', () => {
    expect(csvField(42)).toBe('"42"')
  })
})

describe('toCsv builds one quoted, guarded row per record', () => {
  test('an empty row set is an empty string, not a header with nothing under it', () => {
    expect(toCsv([])).toBe('')
  })

  test('columns come from the first row, and every row uses that same order', () => {
    const csv = toCsv([{ a: '1', b: '2' }, { a: '3', b: '4' }])
    expect(csv).toBe('"a","b"\r\n"1","2"\r\n"3","4"\r\n')
  })

  test('a formula-shaped cell anywhere in the data is guarded, not just in the first column', () => {
    const csv = toCsv([{ reference: 'ABCDEF', name: '=HYPERLINK("http://evil.invalid")' }])
    expect(csv).toContain('"\'=HYPERLINK(""http://evil.invalid"")"')
  })

  test('rows are joined with CRLF, the line ending RFC 4180 asks for', () => {
    expect(toCsv([{ a: '1' }])).toBe('"a"\r\n"1"\r\n')
  })
})
