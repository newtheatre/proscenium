import { describe, expect, test } from 'bun:test'

// D-103, as Matt narrowed criterion 5 on 5 September 2026: nothing invented reaches the public
// site, so every editorial page ships marked as awaiting the committee until real copy lands.

const PAGES = ['about', 'history', 'get-involved', 'technical-specification']

describe('editorial pages are honest about being placeholders (D-103)', () => {
  for (const slug of PAGES) {
    test(`content/${slug}.md declares itself a placeholder and names what belongs there`, async () => {
      const source = await Bun.file(`content/${slug}.md`).text()
      expect(source).toContain('placeholder: true')
      expect(source).toContain('Awaiting committee copy')
    })
  }

  test('the technical specification invents no venue figures', async () => {
    const source = await Bun.file('content/technical-specification.md').text()
    // No dimension, capacity or measurement should appear until the committee supplies one.
    expect(/\d+\s*(seats?|m\b|metres?|x\s*\d)/i.test(source)).toBe(false)
  })
})
