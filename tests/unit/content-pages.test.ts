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

  // J-111: the landing page's tiles and steps are front matter, so a committee member changing a
  // department's wording never opens a Vue file.
  test('get-involved carries its landing furniture in front matter', async () => {
    const source = await Bun.file('content/get-involved.md').text()
    const front = source.slice(0, source.indexOf('\n---', 4))
    for (const field of ['headline:', 'flash:', 'departments:', 'steps:', 'quote:']) {
      expect(`${field} ${front.includes(field)}`).toBe(`${field} true`)
    }
  })

  test('the landing page names no figure, the membership fee included', async () => {
    const source = await Bun.file('content/get-involved.md').text()
    // A price, a count of anything, or a bare number in the prose: all of them are the
    // configuration's to state, and none of them has a key yet (J-111 criterion 2).
    expect(source).not.toMatch(/£\s?\d/)
    expect(source).not.toMatch(/\b\d+\s*(pounds|members|shows|people|weeks|years)\b/i)
  })

  test('the technical specification invents no venue figures', async () => {
    const source = await Bun.file('content/technical-specification.md').text()
    // No dimension, capacity or measurement should appear until the committee supplies one.
    expect(/\d+\s*(seats?|m\b|metres?|x\s*\d)/i.test(source)).toBe(false)
  })
})
