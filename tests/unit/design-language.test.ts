import { describe, expect, test } from 'bun:test'

// The design language's own rule: if it is not a token, it is not in the system (0021).
// theme.css is the one file allowed raw values, because it defines the tokens.
const TOKEN_SOURCE = 'app/assets/css/theme.css'
const HEX = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi

async function appFiles(): Promise<string[]> {
  const glob = new Bun.Glob('**/*.{vue,ts,css}')
  return [...glob.scanSync({ cwd: 'app', onlyFiles: true })]
    .map(path => `app/${path}`)
    .filter(path => path !== TOKEN_SOURCE)
    .sort()
}

describe('design language (0021)', () => {
  test('no raw hex colours outside the token source', async () => {
    const offenders: string[] = []
    for (const file of await appFiles()) {
      const source = await Bun.file(file).text()
      source.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(HEX)) {
          offenders.push(`${file}:${index + 1}  ${match[0]}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  test('the token source defines the three brand scales', async () => {
    const theme = await Bun.file(TOKEN_SOURCE).text()
    for (const scale of ['--color-purple-600', '--color-gold-400', '--color-ash-950']) {
      expect(`${scale}: ${theme.includes(scale)}`).toBe(`${scale}: true`)
    }
  })

  test('the light ground is paper and a raised surface is white (K-130)', async () => {
    const theme = await Bun.file(TOKEN_SOURCE).text()
    const root = theme.slice(theme.indexOf(':root {'), theme.indexOf('.dark {'))
    expect(root).toContain('--ui-bg: var(--ui-color-neutral-50)')
    expect(root).toContain('--ui-bg-muted: var(--ui-color-neutral-100)')
    expect(root).toContain('--ui-bg-elevated: white')
    expect(root).toContain('--ui-bg-accented: var(--ui-color-neutral-200)')
  })

  test('the fonts are self-hosted, with no Google Fonts request', async () => {
    const theme = await Bun.file(TOKEN_SOURCE).text()
    expect(theme).toContain('@fontsource-variable/')
    expect(theme).not.toContain('fonts.googleapis.com')
  })
})

// K-101 criterion 4: a new screen inherits focus and contrast from the tokens rather than
// remembering to ask for them.
describe('the accessibility floor is in the tokens (K-101)', () => {
  test('the token source defines a focus ring, and both themes have one', async () => {
    const theme = await Bun.file(TOKEN_SOURCE).text()
    expect(theme).toContain('--nnt-focus-ring')
    expect(theme).toContain(':focus-visible')
    // The light value and the dark override: purple-600 vanishes against stage black.
    expect(theme.match(/--nnt-focus-ring:/g)?.length).toBeGreaterThanOrEqual(2)
  })

  test('nothing removes a focus outline without putting one back', async () => {
    const offenders: string[] = []
    for (const file of await appFiles()) {
      const source = await Bun.file(file).text()
      source.split('\n').forEach((line, index) => {
        if (/outline\s*:\s*(none|0)\b/.test(line) || /\boutline-none\b/.test(line)) {
          offenders.push(`${file}:${index + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})

// K-101 criterion 3: availability, validity and connection are never carried by colour alone.
describe('colour is never the only thing saying it (K-101)', () => {
  test('every badge carries words, not just a colour', async () => {
    const offenders: string[] = []
    for (const file of (await appFiles()).filter(path => path.endsWith('.vue'))) {
      const source = await Bun.file(file).text()
      for (const badge of source.matchAll(/<UBadge\b([^>]*?)(\/>|>([\s\S]*?)<\/UBadge>)/g)) {
        const attributes = badge[1] ?? ''
        const between = (badge[3] ?? '').trim()
        const labelled = /\blabel\s*=/.test(attributes) || /:label\s*=/.test(attributes)
          || /aria-label\s*=/.test(attributes) || between.length > 0
        if (!labelled) offenders.push(`${file}  a badge with no words in it`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('an icon standing on its own says what it is', async () => {
    const offenders: string[] = []
    for (const file of (await appFiles()).filter(path => path.endsWith('.vue'))) {
      const source = await Bun.file(file).text()
      for (const button of source.matchAll(/<UButton\b([^>]*?)\/>/g)) {
        const attributes = button[1] ?? ''
        const hasIcon = /\bicon\s*=/.test(attributes) || /:icon\s*=/.test(attributes)
        const hasWords = /\blabel\s*=/.test(attributes) || /:label\s*=/.test(attributes)
          || /aria-label\s*=/.test(attributes) || /:aria-label\s*=/.test(attributes)
        if (hasIcon && !hasWords) offenders.push(`${file}  an icon-only button with no name`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// Photography rule: a `PhotoHero` picture is a backdrop behind the headline, so it carries an
// empty alt and a caller that names it makes a screen reader read the picture before the words.
describe('the hero photograph is decorative (K-101, docs/design-language.md)', () => {
  test('PhotoHero declares no alt prop', async () => {
    const source = await Bun.file('app/components/PhotoHero.vue').text()
    expect(source).not.toMatch(/\balt\?:/)
    expect(source).toContain('alt=""')
  })

  test('no caller passes alt to PhotoHero', async () => {
    const offenders: string[] = []
    for (const file of (await appFiles()).filter(path => path.endsWith('.vue'))) {
      const source = await Bun.file(file).text()
      for (const hero of source.matchAll(/<PhotoHero\b([\s\S]*?)>/g)) {
        if (/(^|\s):?alt\s*=/.test(hero[1] ?? '')) offenders.push(`${file}  a hero that names its picture`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// The house frames show artwork and never overlays it, so the card's flag sits on the card body
// and not inside the frame (docs/design-language.md, photography rule 2).
describe('nothing is drawn over show artwork (J-111)', () => {
  test('the poster card positions nothing over the frame', async () => {
    const source = await Bun.file('app/components/ShowPosterCard.vue').text()
    const header = source.slice(source.indexOf('<template #header>'), source.indexOf('</template>', source.indexOf('<PosterFrame')))
    expect(header).not.toContain('absolute')
  })

  test('the artless frame floors its own contrast rather than trusting the hash', async () => {
    const source = await Bun.file('app/components/PosterFrame.vue').text()
    const artless = source.slice(source.indexOf('nnt-poster-none'))
    expect(artless).toContain('nnt-scrim')
  })
})

// The theatre's name is read, not decoration, so the eyebrow clears the small-text floor rather
// than sitting at 9.6px in the muted foreground (K-101).
describe('the wordmark eyebrow is readable (K-101)', () => {
  test('it is neither sub-11px nor muted', async () => {
    const source = await Bun.file('app/components/SiteWordmark.vue').text()
    const eyebrow = source.slice(source.indexOf('The Nottingham') - 200, source.indexOf('The Nottingham'))
    expect(eyebrow).not.toContain('text-[0.6rem]')
    expect(eyebrow).not.toContain('text-muted')
  })
})

// A raw type="time" hands the control to the OS picker, with none of TimeField's theme or focus
// ring. Scoped to box office: rooms/book.vue carries the same defect, and is another stream's file.
describe('a time is always the shared TimeField (#915)', () => {
  test('no UInput in box office takes type="time"', async () => {
    const offenders: string[] = []
    for (const file of (await appFiles()).filter(path => path.startsWith('app/components/box-office/') || path.startsWith('app/pages/box-office/'))) {
      const source = await Bun.file(file).text()
      for (const input of source.matchAll(/<UInput\b[^>]*?\btype\s*=\s*"time"[^>]*?\/?>/g)) {
        offenders.push(`${file}  ${input[0].trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// The member and public shells, the console's half of the same rule being in
// admin-conventions.test.ts. A locale format takes the runtime's zone, which is UTC (0014).
const LOCALE_FORMAT = /\.toLocale(?:Date|Time)?String\(/
const CONSOLE_LAYOUT = /layout:\s*['"`]console['"`]/

// Machine values a reader never sees. The list may shrink and may not grow.
const MEMBER_RAW_DATES: string[] = []

describe('a date off the console is read in London (K-127, K-128, issue 1153 item 2)', () => {
  test('no member or public file formats a date by locale', async () => {
    const found: string[] = []
    for (const file of await appFiles()) {
      const source = await Bun.file(file).text()
      if (CONSOLE_LAYOUT.test(source) || MEMBER_RAW_DATES.includes(file)) continue
      if (LOCALE_FORMAT.test(source)) found.push(file)
    }
    expect(found).toEqual([])
  })

  test('no member or public page puts an ISO instant on the page', async () => {
    const found: string[] = []
    for (const file of await appFiles()) {
      const source = await Bun.file(file).text()
      if (CONSOLE_LAYOUT.test(source)) continue
      const start = source.search(/^<template>$/m)
      if (start !== -1 && source.slice(start).includes('toISOString(')) found.push(file)
    }
    expect(found).toEqual([])
  })
})

// A screen asks for a shape, it does not build one: formatLondon is the mechanism under
// shared/utils/when.ts, and a bespoke options object is how the two shapes drifted (copy-style §9).
const BUILDS_ITS_OWN = /formatLondon\(/

// The console screens the first slice did not reach, and the show-night screens, which are
// another stream's files. The list may shrink and may not grow.
const BUILDS_ITS_OWN_ALLOWED = [
  'app/components/box-office/show/Performances.vue',
  'app/components/box-office/show/Sales.vue',
  'app/components/box-office/show/StatusStrip.vue',
  'app/components/till/TicketsPane.vue',
  'app/pages/admin/audit.vue',
  'app/pages/admin/index.vue',
  'app/pages/admin/settings.vue',
  'app/pages/bar/stock/movements.vue',
  'app/pages/bar/stock/stocktakes/[id].vue',
  'app/pages/bar/stock/stocktakes/index.vue',
  'app/pages/bar/tabs.vue',
  'app/pages/box-office/pass-types.vue',
  'app/pages/comms/operations/accounts/[id].vue',
  'app/pages/people/accounts/index.vue',
  'app/pages/people/roles.vue',
  'app/pages/rooms/index.vue',
  'app/pages/rooms/manage/requests.vue',
  'app/pages/rooms/mine.vue',
  'app/pages/rota/manage/approvals.vue',
  'app/pages/rota/manage/emergency.vue',
  'app/pages/rota/manage/openings.vue',
  'app/pages/rota/manage/safety.vue',
  'app/pages/rota/manage/shifts.vue',
  'app/pages/tonight/emergency.vue',
  'app/pages/tonight/glance.vue',
  'app/pages/tonight/till/index.vue',
]

describe('a date shape comes from the shared helpers (K-127, K-128, issue 1153 item 2)', () => {
  test('no page or component builds its own date format', async () => {
    const found: string[] = []
    for (const file of await appFiles()) {
      if (BUILDS_ITS_OWN_ALLOWED.includes(file)) continue
      if (BUILDS_ITS_OWN.test(await Bun.file(file).text())) found.push(file)
    }
    expect(found).toEqual([])
  })

  test('the allow-list names only files that still build one', async () => {
    const stale: string[] = []
    for (const file of BUILDS_ITS_OWN_ALLOWED) {
      if (!BUILDS_ITS_OWN.test(await Bun.file(file).text())) stale.push(file)
    }
    expect(stale).toEqual([])
  })
})
