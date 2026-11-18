// The QR poster for a scheme's join page: the words on it are escaped, the link is written out, and
// a long summary is cut to three lines.
import { describe, expect, it } from 'vitest'
import { membershipPosterSvg } from '../../app/utils/membership-poster'

describe('the join poster', () => {
  const text = { theatre: 'New Theatre & Co', title: 'Join NNT <Members>', summary: null, url: 'https://example.org/join/nnt-members', scan: 'Scan to join' }

  it('writes the theatre, the scheme and the link, escaped', () => {
    const svg = membershipPosterSvg(text)
    expect(svg).toContain('New Theatre &amp; Co')
    expect(svg).toContain('&lt;Members&gt;')
    expect(svg).toContain('https://example.org/join/nnt-members')
    expect(svg).toContain('Scan to join')
    expect(svg).toMatch(/<path d="M\d/)
  })

  it('keeps a long summary to three lines', () => {
    const svg = membershipPosterSvg({ ...text, summary: 'word '.repeat(200) })
    const lines = svg.match(/font-size="72"/g) ?? []
    expect(lines).toHaveLength(3)
    expect(svg).toContain('…')
  })
})
