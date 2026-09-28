import { describe, expect, test } from 'bun:test'
import { HEADER_NAV, PUBLIC_NAV } from '#shared/utils/site-nav'

// D-103: every editorial page is written now. About, history and the technical page carry the
// committee's direction of 27 September 2026 (criteria 7 to 9).

const PAGES = ['about', 'history', 'technical-specification', 'get-involved']

// Section 4 of the 2026/27 constitution, in its order.
const COMMITTEE = [
  'President',
  'Secretary and Welfare Officer',
  'Treasurer',
  'Front of House Manager',
  'In-House Coordinator',
  'Studio Coordinator',
  'Creatives Coordinator',
  'External Relations Manager',
  'Marketing Coordinator',
  'Social and Fundraising Coordinator',
  'Theatre Manager',
  'Company Stage Manager',
  'Company Technical Director',
  'Technical Manager',
  'Company Workshop Manager',
  'Costume, Props and Make-Up Manager',
  'Archivist',
  'Events and Engagement Coordinator',
]

const read = (slug: string): Promise<string> => Bun.file(`content/${slug}.md`).text()
const frontOf = (source: string): string => source.slice(0, source.indexOf('\n---', 4))
const bodyOf = (source: string): string => source.slice(source.indexOf('\n---', 4) + 4)

describe('no editorial page still awaits the committee (D-103)', () => {
  for (const slug of PAGES) {
    test(`content/${slug}.md is not flagged and says nothing is missing`, async () => {
      const source = await read(slug)
      expect(frontOf(source)).not.toContain('placeholder: true')
      expect(source).not.toContain('Awaiting committee copy')
    })
  }
})

describe('about says who we are, who runs it and where the building stands (D-103 criterion 7)', () => {
  test('the short history points to the history project', async () => {
    expect(await read('about')).toContain('](https://history.newtheatre.org.uk/)')
  })

  test('the closure points to the campaign', async () => {
    expect(await read('about')).toContain('](https://savennt.com/)')
  })

  test('general enquiries go to the box office', async () => {
    expect(await read('about')).toContain('](mailto:boxoffice@newtheatre.org.uk)')
  })

  test('the committee table carries every constitutional role, each with a holder and an address', async () => {
    const rows = bodyOf(await read('about')).split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Role') && !line.startsWith('| ---'))
    const cells = rows.map(row => row.split('|').slice(1, -1).map(cell => cell.trim()))
    expect(cells.map(row => row[0])).toEqual(COMMITTEE)
    const incomplete = cells.filter(row => row.length !== 3 || !row[1] || !row[2]).map(row => row[0])
    expect(incomplete).toEqual([])
  })

  // No holder is named until the committee supplies one. The brackets are escaped, since MDC
  // reads a bare [text] as a span and drops them.
  test('a holder not yet supplied is a bracketed gap', async () => {
    const body = bodyOf(await read('about'))
    expect(body).toContain('\\[name goes here\\]')
    expect(body).not.toMatch(/(?<!\\)\[(name|address) goes here/)
  })
})

describe('history carries the short history and points onward (D-103 criterion 7)', () => {
  test('it links the history project and its address', async () => {
    const source = await read('history')
    expect(source).toContain('](https://history.newtheatre.org.uk/)')
    expect(source).toContain('](mailto:history@newtheatre.org.uk)')
  })
})

describe('the technical page describes the space and routes the detail (D-103 criterion 8)', () => {
  test('it names the Studio, where it is, its capacity and its access', async () => {
    const body = bodyOf(await read('technical-specification'))
    expect(body).toContain('Portland Studio')
    expect(body).toContain('62 seats')
    expect(body).toMatch(/step-free/i)
  })

  test('a detailed specification is asked for by email, not published', async () => {
    const body = bodyOf(await read('technical-specification'))
    expect(body).toContain('](mailto:technical@newtheatre.org.uk)')
    expect(body).not.toMatch(/^#+ .*(lighting|sound|rig|dimmer|desk)/im)
  })
})

describe('the editorial pages in the navigation (D-103 criterion 9)', () => {
  test('about and history are header destinations', () => {
    const header = HEADER_NAV.map(entry => entry.to)
    expect(header).toContain('/about')
    expect(header).toContain('/history')
  })

  test('the technical page keeps its address under its new label', () => {
    expect(PUBLIC_NAV.find(entry => entry.to === '/technical-specification')?.label).toBe('Technical information')
  })
})

describe('get-involved furniture (J-111)', () => {
  // D-103 criterion 6: an unwritten field is absent, never a stand-in sentence somebody could
  // mistake for a member's own words.
  test('get-involved carries no stand-in quote and has no stand-in prose', async () => {
    const source = await read('get-involved')
    expect(frontOf(source)).not.toContain('quote:')
    expect(bodyOf(source).trim()).toBe('')
  })

  // J-111: the landing page's tiles and steps are front matter, so a committee member changing a
  // department's wording never opens a Vue file.
  test('get-involved carries its landing furniture in front matter', async () => {
    const front = frontOf(await read('get-involved'))
    for (const field of ['headline:', 'flash:', 'departments:', 'steps:']) {
      expect(`${field} ${front.includes(field)}`).toBe(`${field} true`)
    }
  })

  test('the landing page names no figure, the membership fee included', async () => {
    const source = await read('get-involved')
    // A price, a count of anything, or a bare number in the prose: all of them are the
    // configuration's to state, and none of them has a key yet (J-111 criterion 2).
    expect(source).not.toMatch(/£\s?\d/)
    expect(source).not.toMatch(/\b\d+\s*(pounds|members|shows|people|weeks|years)\b/i)
  })
})
