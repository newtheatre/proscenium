// Pure parts of the core domain: brand colours (C-35), file inspection and cleaning (C-23, C-36),
// the operating day (C-37), email rendering (C-27) and the fork-site check (C-40).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrast, nearestShade, over, solidFill } from '../../shared/colour'
import { themeCss, tokensFor, type BrandChoice } from '../../server/brand/theme'
import { BRAND_FONTS, type BrandFont } from '../../shared/brand-fonts'
import { clean, cleanSvg, sniff, Rejected } from '../../server/files/inspect'
import { operatingDayAt, operatingDayBounds } from '../../server/calendar'
import { hasLink, linkPath, render, variablesIn, isSafeUrl } from '../../server/notifications/render'
import { appRoutes, componentProblems, navigationProblems, pagePaths, redirectProblems } from '../../../../scripts/checks/site'
import { findRedirect } from '../../shared/redirects'

const ascii = (s: string) => [...s].map(c => c.charCodeAt(0))
const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
const PUBLIC_FONTS = new URL('../../public/fonts', import.meta.url).pathname
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b)

describe('brand colours (C-35)', () => {
  const choice = (accent: string): BrandChoice => ({ accent, neutral: 'slate', displayFont: 'system', bodyFont: 'system', radius: 'medium' })
  const colours = ['#ffff00', '#00ff00', '#ffffff', '#000000', '#2563eb', '#f4a7b9', '#7c3aed', '#0e7490', '#fde047', '#808080']

  it.each(colours)('keeps text readable whatever colour is chosen: %s', (accent) => {
    const tokens = tokensFor(choice(accent))
    for (const mode of [tokens.light, tokens.dark]) {
      expect(contrast(mode.link, mode.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(mode.onSolid, mode.solid)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(mode.text, mode.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(mode.muted, mode.background)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('leaves a colour alone when it already reads well, and otherwise moves only its lightness', () => {
    expect(nearestShade('#1d4ed8', '#ffffff')).toBe('#1d4ed8')
    const shade = nearestShade('#ffff00', '#ffffff')
    expect(shade).not.toBe('#ffff00')
    expect(contrast(shade, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(solidFill('#ffff00').text).toBe('#0c0a09')
  })

  it('writes light onto :root and dark onto the colour mode\'s .dark class', () => {
    const tokens = tokensFor(choice('#2563eb'))
    const css = themeCss(tokens)
    expect(css).toContain(':root{--brand-radius:0.5rem')
    expect(css).toContain(`--brand-link:${tokens.light.link}`)
    expect(css).toMatch(new RegExp(`html\\.dark\\{[^}]*--brand-link:${tokens.dark.link}`))
  })

  it('asks for no font file while both fonts are the device\'s own, and leaves the body font alone', () => {
    const css = themeCss(tokensFor(choice('#2563eb')))
    expect(css).not.toContain('@font-face')
    expect(css).not.toContain('public-shell')
  })

  it('serves a chosen font from the site itself, and only the fonts chosen', () => {
    const tokens = tokensFor({ ...choice('#2563eb'), displayFont: 'bricolage-grotesque', bodyFont: 'figtree' })
    const css = themeCss(tokens)
    expect(tokens.displayFont).toMatch(/^"Bricolage Grotesque Variable", /)
    expect(css).toContain('src:url(/fonts/bricolage-grotesque/bricolage-grotesque-latin-wght-normal.woff2)')
    expect(css).toContain('src:url(/fonts/figtree/figtree-latin-ext-wght-normal.woff2)')
    expect(css).not.toMatch(/inter|fraunces/)
    expect(css).not.toMatch(/https?:\/\//)
    expect(css).toContain(`body.public-shell{font-family:${tokens.bodyFont}}`)
  })

  it('has every served font\'s files and licence in public/fonts', () => {
    for (const font of Object.values(BRAND_FONTS) as BrandFont[]) {
      if (!font.served) continue
      const folder = join(PUBLIC_FONTS, font.served.folder)
      expect(readFileSync(join(folder, 'OFL.txt'), 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1')
      for (const subset of ['latin', 'latin-ext']) expect(existsSync(join(folder, `${font.served.folder}-${subset}-wght-normal.woff2`))).toBe(true)
    }
  })

  it('gives Nuxt UI a primary that reads under its inverted text and on the page, in both modes', () => {
    for (const accent of ['#2563eb', '#ffff00', '#7f1d1d', '#10b981', '#e11d48', '#7c3aed', '#111111']) {
      const tokens = tokensFor(choice(accent))
      const [, light, dark] = themeCss(tokens).match(/html:root\{[^}]*--ui-primary:(#[0-9a-f]{6})[^}]*\}\s*html\.dark\{[^}]*--ui-primary:(#[0-9a-f]{6})/)!
      expect(contrast(light!, '#ffffff')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dark!, tokens.neutral[9]!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(dark!, tokens.dark.background)).toBeGreaterThanOrEqual(4.5)
      // A filled button under the pointer is the fill at 90% over the page (app.config.ts).
      expect(contrast(over(light!, '#ffffff', 0.9), '#ffffff')).toBeGreaterThanOrEqual(4.5)
      expect(contrast(over(dark!, tokens.dark.background, 0.9), tokens.neutral[9]!)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

function png(extra: number[][] = []) {
  const chunk = (type: string, data: number[]) => [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0]
  return new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    ...chunk('IHDR', [...u32be(640), ...u32be(480), 8, 6, 0, 0, 0]),
    ...extra.flat(),
    ...chunk('IDAT', [1, 2, 3]),
    ...chunk('IEND', []),
  ])
}
const pngChunk = (type: string, data: string) => [...u32be(data.length), ...ascii(type), ...ascii(data), 0, 0, 0, 0]

function jpeg() {
  const segment = (marker: number, data: number[]) => [0xFF, marker, ...[(data.length + 2) >> 8, (data.length + 2) & 255], ...data]
  return new Uint8Array([
    0xFF, 0xD8,
    ...segment(0xE0, ascii('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')),
    ...segment(0xE1, ascii('Exif\0\0GPS 51.5N Taken by Jo Bloggs')),
    ...segment(0xFE, ascii('a comment')),
    ...segment(0xC0, [8, 0, 200, 1, 44, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...segment(0xDA, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3F, 0]),
    0x12, 0x34, 0xFF, 0xD9,
  ])
}

function webp() {
  const chunk = (type: string, data: number[]) => [...ascii(type), ...u32le(data.length), ...data, ...(data.length % 2 ? [0] : [])]
  const body = [
    ...ascii('WEBP'),
    ...chunk('VP8X', [0x08 | 0x04, 0, 0, 0, 99, 0, 0, 49, 0, 0]),
    ...chunk('VP8 ', [0, 0, 0, 0x9D, 0x01, 0x2A, 100, 0, 50, 0]),
    ...chunk('EXIF', ascii('GPS 51.5N')),
    ...chunk('XMP ', ascii('<x:xmpmeta>Jo</x:xmpmeta>')),
  ]
  return new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body])
}

const svg = (body: string, head = '<?xml version="1.0"?>\n') => new TextEncoder().encode(`${head}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">${body}</svg>`)

describe('files are judged by their bytes (C-23)', () => {
  it('knows each kind from its first bytes, whatever it is called', () => {
    expect(sniff(png())).toBe('png')
    expect(sniff(jpeg())).toBe('jpeg')
    expect(sniff(webp())).toBe('webp')
    expect(sniff(svg('<rect/>'))).toBe('svg')
    expect(sniff(new TextEncoder().encode('%PDF-1.7 ...'))).toBe('pdf')
    expect(sniff(new TextEncoder().encode('<html><script>alert(1)</script></html>'))).toBeUndefined()
    expect(sniff(new TextEncoder().encode('MZ\x90\0 not an image'))).toBeUndefined()
  })
})

describe('raster images lose their metadata (C-36)', () => {
  it('strips text and time chunks from a PNG and keeps its size', () => {
    const out = clean('png', png([pngChunk('tEXt', 'Author\0Jo Bloggs'), pngChunk('tIME', '1234567')]), { clean: true })
    expect(text(out.bytes)).not.toContain('Jo Bloggs')
    expect(text(out.bytes)).not.toContain('tIME')
    expect(text(out.bytes)).toContain('IDAT')
    expect(out).toMatchObject({ width: 640, height: 480 })
  })

  it('strips EXIF and comments from a JPEG and keeps the image', () => {
    const out = clean('jpeg', jpeg(), { clean: true })
    expect(text(out.bytes)).not.toContain('GPS')
    expect(text(out.bytes)).not.toContain('a comment')
    expect(text(out.bytes)).toContain('JFIF')
    expect([...out.bytes.slice(-4)]).toEqual([0x12, 0x34, 0xFF, 0xD9])
    expect(out).toMatchObject({ width: 300, height: 200 })
  })

  it('strips EXIF and XMP from a WebP, clears their flags and fixes the length', () => {
    const out = clean('webp', webp(), { clean: true })
    const s = text(out.bytes)
    expect(s).not.toContain('GPS')
    expect(s).not.toContain('xmpmeta')
    expect(out.bytes[20]! & 0x0C).toBe(0)
    expect(new DataView(out.bytes.buffer).getUint32(4, true)).toBe(out.bytes.length - 8)
    expect(out).toMatchObject({ width: 100, height: 50 })
  })

  it('refuses a damaged image', () => {
    expect(() => clean('jpeg', new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0xFF]), { clean: true })).toThrow(Rejected)
  })
})

describe('an SVG logo is cleaned or refused (C-36)', () => {
  const reason = (bytes: Uint8Array) => {
    try {
      cleanSvg(bytes)
      return 'accepted'
    }
    catch (error) {
      return (error as Rejected).reason
    }
  }

  it('keeps drawing and drops editors\' metadata and comments', () => {
    const out = cleanSvg(svg('<!-- made by Jo --><metadata><rdf:RDF><dc:creator>Jo Bloggs</dc:creator></rdf:RDF></metadata><sodipodi:namedview inkscape:zoom="2"/><g inkscape:label="Layer 1"><path d="M0 0h10v10z" fill="url(#g)"/></g><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient>'))
    const s = new TextDecoder().decode(out.bytes)
    expect(s).not.toContain('Jo')
    expect(s).not.toContain('inkscape')
    expect(s).not.toContain('<?xml')
    expect(s).toContain('<path d="M0 0h10v10z" fill="url(#g)"/>')
    expect(out).toMatchObject({ width: 120, height: 40 })
  })

  it.each([
    ['a script', '<script>alert(1)</script>', 'svg-script'],
    ['an event handler', '<rect onload="alert(1)"/>', 'svg-script'],
    ['an external image', '<image href="https://evil.example/x.png"/>', 'svg-external-reference'],
    ['an external use', '<use href="https://evil.example/x.svg#a"/>', 'svg-external-reference'],
    ['a javascript link', '<use href="java&#x73;cript:alert(1)"/>', 'svg-external-reference'],
    ['foreign HTML', '<foreignObject><div>hi</div></foreignObject>', 'svg-external-reference'],
    ['an external stylesheet', '<style>@import url(https://evil.example/x.css);</style>', 'svg-external-reference'],
    ['an external font in a style', '<rect style="fill:url(https://evil.example/f)"/>', 'svg-external-reference'],
    ['an animation that rewrites a link', '<set attributeName="href" to="javascript:alert(1)"/>', 'svg-external-reference'],
  ])('refuses %s', (_, body, expected) => {
    expect(reason(svg(body))).toBe(expected)
  })

  it('refuses a DOCTYPE, which can define entities', () => {
    expect(reason(svg('<rect/>', '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]>'))).toBe('svg-doctype')
  })
})

describe('the operating day (C-37)', () => {
  const london = { timeZone: 'Europe/London', rollover: '04:00' }

  it('puts the midnight show with the evening it started', () => {
    expect(operatingDayAt(Date.parse('2026-11-14T23:30:00Z'), london)).toBe('2026-11-14')
    expect(operatingDayAt(Date.parse('2026-11-15T00:30:00Z'), london)).toBe('2026-11-14')
    expect(operatingDayAt(Date.parse('2026-11-15T04:00:00Z'), london)).toBe('2026-11-15')
  })

  it('handles the clocks changing', () => {
    // 29 March 2026: clocks go forward at 01:00 GMT. 03:59 BST is 02:59 UTC, still the night before.
    expect(operatingDayAt(Date.parse('2026-03-29T02:59:00Z'), london)).toBe('2026-03-28')
    expect(operatingDayAt(Date.parse('2026-03-29T03:00:00Z'), london)).toBe('2026-03-29')
    const spring = operatingDayBounds('2026-03-28', london)
    expect(spring.end - spring.start).toBe(23 * 3_600_000)
    // 25 October 2026: clocks go back; that operating day is 25 hours long.
    const autumn = operatingDayBounds('2026-10-24', london)
    expect(autumn.end - autumn.start).toBe(25 * 3_600_000)
  })

  it('works for a theatre far from London', () => {
    const auckland = { timeZone: 'Pacific/Auckland', rollover: '04:00' }
    // 10:30 UTC on 14 November is 23:30 in Auckland; 12:30 UTC is 01:30 the next morning.
    expect(operatingDayAt(Date.parse('2026-11-14T10:30:00Z'), auckland)).toBe('2026-11-14')
    expect(operatingDayAt(Date.parse('2026-11-14T12:30:00Z'), auckland)).toBe('2026-11-14')
    expect(operatingDayAt(Date.parse('2026-11-14T15:30:00Z'), auckland)).toBe('2026-11-15')
  })

  it('follows a different rollover', () => {
    expect(operatingDayAt(Date.parse('2026-11-15T00:30:00Z'), { timeZone: 'Europe/London', rollover: '00:00' })).toBe('2026-11-15')
  })
})

describe('email wording (C-27)', () => {
  it('lists the variables a wording uses', () => {
    expect(variablesIn('Hello {{ name }}, see {{link}} at {{ theatre }}').sort()).toEqual(['link', 'name', 'theatre'])
  })

  it('draws a lone {{ qr name }} as a QR code of table cells in HTML, and leaves it out of the text', () => {
    expect(variablesIn('Code **{{ code }}**\n\n{{ qr code }}')).toEqual(['code'])
    const out = render({ subject: 'Hi', body: 'Your code is **{{ code }}**\n\n{{ qr code }}\n\nSee you soon.' }, { values: { code: 'PASS-7KD2-M4QX' }, kinds: { code: 'sealed' }, accent: '#000000', theatre: 'T' })
    expect(out.html).toContain('aria-label="QR code"')
    expect(out.html.match(/<tr>/g)).toHaveLength(29)
    const two = render({ subject: 'Hi', body: '{{ qr codes }}' }, { values: { codes: 'Ticket 1 of 2\tt.k.AAAA.sig\nTicket 2 of 2\tt.k.BBBB.sig' }, kinds: { codes: 'sealed' }, accent: '#000000', theatre: 'T' })
    expect(two.html.match(/aria-label="QR code: Ticket \d of 2"/g)).toHaveLength(2)
    expect(two.html).toContain('>Ticket 2 of 2</p>')
    expect(render({ subject: 'Hi', body: 'A.\n\n{{ qr codes }}' }, { values: { codes: ' ' }, kinds: { codes: 'sealed' }, accent: '#000000', theatre: 'T' }).html).not.toContain('QR code')
    expect(out.html).toContain('bgcolor=#000')
    expect(out.text).toBe('Your code is PASS-7KD2-M4QX\n\nSee you soon.\n')
    expect(out.text).not.toContain('qr')
  })

  it('takes only https addresses, except on this machine', () => {
    expect(isSafeUrl('https://example.org/x')).toBe(true)
    expect(isSafeUrl('http://localhost:3000/x')).toBe(true)
    expect(isSafeUrl('http://example.org/x')).toBe(false)
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
  })

  it('never links a literal address that is not https', () => {
    const out = render({ subject: 'Hi', body: '[click](http://evil.example)' }, { values: {}, kinds: {}, accent: '#000000', theatre: 'T' })
    expect(out.html).not.toContain('href="http://evil.example"')
    expect(out.text).toContain('click')
  })

  it('writes a link as its words alone for the inbox, and with its address for plain email', () => {
    const out = render({ subject: 'Hi', body: 'Thanks.\n\n[See your response]({{ link }})' }, { values: { link: 'https://example.org/account/forms/1' }, kinds: { link: 'link' }, accent: '#000000', theatre: 'T' })
    expect(out.inbox).toBe('Thanks.\n\nSee your response')
    expect(out.text).toContain('See your response: https://example.org/account/forms/1')
  })

  it('makes a paragraph that is only a link into a button, with the address beneath', () => {
    const out = render({ subject: 'Hi', body: 'Before.\n\n[Show my tickets]({{ link }})' }, { values: { link: 'https://t.example/o/1' }, kinds: { link: 'sealed' }, accent: '#123456', theatre: 'T' })
    expect(out.html).toContain('background:#123456')
    expect(out.html).toMatch(/<a href="https:\/\/t\.example\/o\/1"[^>]*>Show my tickets<\/a><\/td>/)
    expect(out.html).toContain('word-break:break-all">https://t.example/o/1</p>')
    expect(out.text).toContain('Show my tickets: https://t.example/o/1')
  })

  it('adds the action button only when the wording has no link of its own', () => {
    expect(hasLink('[Open]({{ link }})', { link: 'https://t.example/x' }, { link: 'text' })).toBe(true)
    expect(hasLink('See {{ link }}', { link: 'https://t.example/x' }, { link: 'url' })).toBe(true)
    expect(hasLink('Open it to review it.', {}, {})).toBe(false)
    const out = render({ subject: 'Hi', body: 'Open it to review it.' }, { values: {}, kinds: {}, accent: '#000000', theatre: 'T', action: { label: 'Open the incident', url: 'https://t.example/i/1' } })
    expect(out.html).toContain('href="https://t.example/i/1"')
    expect(out.text).toContain('Open the incident: https://t.example/i/1')
    expect(linkPath('/console/incidents/{{ incident }}', { incident: 'a b' })).toBe('/console/incidents/a%20b')
    expect(linkPath('//evil.example', {})).toBeNull()
  })

  it('keeps the subject on one line', () => {
    const out = render({ subject: 'Hello {{ name }}', body: 'x' }, { values: { name: 'A\r\nBcc: x@y' }, kinds: { name: 'text' }, accent: '#000000', theatre: 'T' })
    expect(out.subject).toBe('Hello A Bcc: x@y')
  })

  it('names its language and subject for screen readers, and repaints for dark mode only when given dark colours', () => {
    const light = render({ subject: 'Hello <b>', body: 'x' }, { values: {}, kinds: {}, accent: '#000000', theatre: 'T' })
    expect(light.html).toContain('<html lang="en-GB">')
    expect(light.html).toContain('<title>Hello &lt;b&gt;</title>')
    expect(light.html).toContain('role="article" aria-roledescription="email" aria-label="Hello &lt;b&gt;"')
    expect(light.html).toContain('<meta name="color-scheme" content="light">')
    expect(light.html).not.toContain('prefers-color-scheme')
    const dark = render({ subject: 'Hi', body: 'x' }, { values: {}, kinds: {}, accent: '#000000', theatre: 'T', lang: 'cy', dark: { background: '#020617', text: '#f1f5f9', muted: '#94a3b8', link: '#93c5fd' } })
    expect(dark.html).toContain('<html lang="cy">')
    expect(dark.html).toContain('content="light dark"')
    expect(dark.html).toMatch(/prefers-color-scheme: dark\)\{\.body\{background:#020617!important/)
  })

  it('draws a variable of bulleted lines as a list, and keeps the bullets in the text', () => {
    const out = render({ subject: 'Hi', body: 'Open:\n\n{{ shifts }}' }, { values: { shifts: '• Posh, Thu: Usher\n• Posh, Fri: <Bar>' }, kinds: { shifts: 'text' }, accent: '#000000', theatre: 'T' })
    expect(out.html).toContain('<li style="margin:0 0 4px">Posh, Thu: Usher</li><li style="margin:0 0 4px">Posh, Fri: &lt;Bar&gt;</li></ul>')
    expect(out.text).toContain('• Posh, Thu: Usher\n• Posh, Fri: <Bar>')
    const prose = render({ subject: 'Hi', body: '{{ note }}' }, { values: { note: '• one\nnot a bullet' }, kinds: { note: 'text' }, accent: '#000000', theatre: 'T' })
    expect(prose.html).not.toContain('<ul')
  })

  it('opens the footer with the signature delimiter', () => {
    expect(render({ subject: 'Hi', body: 'x' }, { values: {}, kinds: {}, accent: '#000000', theatre: 'T', footer: 'Address' }).text).toBe('x\n\n-- \nAddress\n')
  })
})

describe('the fork\'s menu and components (C-40)', () => {
  const root = mkdtempSync(join(tmpdir(), 'site-'))
  for (const file of ['index.md', 'about.md', 'visit/index.md', 'visit/access.md']) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), '# x')
  }
  const pages = pagePaths(root)

  it('knows each page\'s address', () => {
    expect([...pages].sort()).toEqual(['/', '/about', '/visit', '/visit/access'])
  })

  it('fails a link to a missing page and passes the rest', () => {
    const problems = navigationProblems({ header: [{ label: 'Home', to: '/' }, { label: 'About', to: '/about/' }, { label: 'Shop', to: 'https://shop.example.org' }, { label: 'Gone', to: '/history' }], footer: [{ label: 'Access', to: '/visit/access#lift' }] }, pages)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('/history')
  })

  it('fails an unknown menu, a link with no label and a relative link', () => {
    expect(navigationProblems({ sidebar: [] }, pages)[0]).toContain('sidebar')
    expect(navigationProblems({ header: [{ to: '/' }] }, pages)[0]).toContain('label')
    expect(navigationProblems({ header: [{ label: 'x', to: 'about' }] }, pages)[0]).toContain('neither')
  })

  describe('old addresses (C-45)', () => {
    const app = mkdtempSync(join(tmpdir(), 'pages-'))
    for (const file of ['whats-on/index.vue', 'whats-on/[slug].vue', 'shows/[slug].vue', '[...slug].vue', 'console/people/index.vue']) {
      mkdirSync(join(app, file, '..'), { recursive: true })
      writeFileSync(join(app, file), '<template />')
    }
    const routes = appRoutes([app, join(app, 'missing')])

    it('knows the app\'s own addresses, and the prefixes of record pages, but not the catch-all', () => {
      expect([...routes.exact].sort()).toEqual(['/console/people', '/whats-on'])
      expect(routes.prefixes).toEqual(['/shows/', '/whats-on/'])
    })

    it('passes entries to pages, record pages and https, and fails the rest', () => {
      const ok = [{ from: '/about-us.html', to: '/about' }, { from: '/show.php?id=12', to: '/whats-on/hamlet' }, { from: '/old-shop/', to: 'https://shop.example.org' }, { from: '/programme', to: '/whats-on' }]
      expect(redirectProblems({ redirects: ok }, pages, routes)).toEqual([])
      expect(redirectProblems({ redirects: [] }, pages, routes)).toEqual([])
      const bad = redirectProblems({ redirects: [
        { from: '/gone', to: '/history' },
        { from: '/about', to: '/visit' },
        { from: 'relative', to: '/' },
        { from: '/loop/', to: '/loop' },
        { from: '/x', to: 'about' },
        { from: '/twice', to: '/' },
        { from: '/twice/', to: '/about' },
        { from: '/to-nowhere', to: '/shows/' },
      ] }, pages, routes)
      expect(bad).toHaveLength(7)
      expect(bad[0]).toContain('/history, which is not a page')
      expect(bad[1]).toContain('/about is a page on this site now')
      expect(bad[2]).toContain('needs from:')
      expect(bad[3]).toContain('to itself')
      expect(bad[4]).toContain('neither')
      expect(bad[5]).toContain('listed twice')
      expect(bad[6]).toContain('/shows')
      expect(redirectProblems({ links: [] }, pages, routes)[0]).toContain('should hold redirects:')
    })

    it('finds the entry for a request, the one naming its query first', () => {
      const list = [{ from: '/show.php', to: '/whats-on' }, { from: '/show.php?id=12', to: '/whats-on/hamlet' }, { from: '/about-us/', to: '/about' }]
      expect(findRedirect(list, '/show.php', '?id=12')?.to).toBe('/whats-on/hamlet')
      expect(findRedirect(list, '/show.php', '?id=13')?.to).toBe('/whats-on')
      expect(findRedirect(list, '/about-us')?.to).toBe('/about')
      expect(findRedirect(list, '/about-us/')?.to).toBe('/about')
      expect(findRedirect(list, '/about')).toBeUndefined()
    })
  })

  it('fails a component nobody offers, outside code', () => {
    const files = [{ file: 'p.md', source: 'Prices in :setting{name="x"}.\n::whats-onn\n::\n`:not-a-component`\n```\n::also-not\n```\nAt 10:30 we open.' }]
    const problems = componentProblems(files, new Set(['setting']))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('whats-onn')
  })
})
