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

// K-102, issue 1150 item 8: a door pass is printed from the counter laptop, and a show-night
// screen is dark. Printing one without a rule puts the whole dark screen on the paper.
describe('printing takes the pass alone, light on white (K-102)', () => {
  test('the token source carries a print rule that hides everything but the pass', async () => {
    const theme = await Bun.file(TOKEN_SOURCE).text()
    const print = theme.slice(theme.indexOf('@media print'))
    expect(theme).toContain('@media print')
    expect(print).toContain('.print-pass')
    expect(print).toContain('visibility: visible')
    expect(print).toContain('color-scheme: light')
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

// 0084: the member shell is calm, its headings are two sizes and its pages take a named width.
// The layout and the settings wrapper are held to it too, being what draws the shell.
const MEMBER_LAYOUT = /layout:\s*['"`]member['"`]/
const MEMBER_SHELL = ['app/layouts/member.vue', 'app/components/AccountSettings.vue']
const MEMBER_WIDTHS = ['MEMBER_PAGE_READING', 'MEMBER_PAGE_WORKING', 'MEMBER_PAGE_WIDE']
const HEADING = /<h([1-6])\b([\s\S]*?)>/g
const CONTAINER = /<UContainer\b([\s\S]*?)>/g

async function memberPages(): Promise<string[]> {
  const pages: string[] = []
  for (const file of (await appFiles()).filter(path => path.startsWith('app/pages/') && path.endsWith('.vue'))) {
    if (MEMBER_LAYOUT.test(await Bun.file(file).text())) pages.push(file)
  }
  return pages
}

function templateOf(source: string): string {
  const start = source.search(/^<template>$/m)
  return start === -1 ? '' : source.slice(start)
}

describe('the member shell is calm (0084, K-127, issue 1153 item 1)', () => {
  test('the shell is fifteen pages and the two files that draw it', async () => {
    expect((await memberPages()).length).toBeGreaterThanOrEqual(15)
  })

  test('no member screen reaches for the expressive kit', async () => {
    const offenders: string[] = []
    for (const file of [...await memberPages(), ...MEMBER_SHELL]) {
      const source = await Bun.file(file).text()
      source.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(/\bnnt-[a-z-]+/g)) offenders.push(`${file}:${index + 1}  ${match[0]}`)
      })
    }
    expect(offenders).toEqual([])
  })

  test('a heading is the page title, a section or a heading inside one', async () => {
    const sizes: Record<string, string> = {
      1: 'text-2xl font-semibold text-highlighted',
      2: 'text-lg font-semibold',
      3: 'text-base font-semibold',
    }
    const offenders: string[] = []
    for (const file of [...await memberPages(), ...MEMBER_SHELL]) {
      const template = templateOf(await Bun.file(file).text())
      for (const heading of template.matchAll(HEADING)) {
        const level = heading[1] ?? ''
        const classes = /class="([^"]*)"/.exec(heading[2] ?? '')?.[1] ?? ''
        const wanted = sizes[level]
        if (wanted === undefined) offenders.push(`${file}  an h${level} below the third level`)
        else if (!classes.includes(wanted)) offenders.push(`${file}  an h${level} that is not "${wanted}": "${classes}"`)
        if (classes.includes('uppercase')) offenders.push(`${file}  an uppercase eyebrow, which is the show-night register`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('every page takes a named width and none spells its own', async () => {
    const offenders: string[] = []
    for (const file of await memberPages()) {
      const source = await Bun.file(file).text()
      const named = MEMBER_WIDTHS.some(width => source.includes(width))
      const delegates = source.includes('<AccountSettings')
      const drawsNothing = !templateOf(source).includes('<UContainer')
      if (!named && !delegates && !drawsNothing) offenders.push(`${file}  names no width`)
      for (const container of templateOf(source).matchAll(CONTAINER)) {
        const classes = /class="([^"]*)"/.exec(container[1] ?? '')?.[1] ?? ''
        if (/\bmax-w-|\bpy-/.test(classes)) offenders.push(`${file}  a container spelling its own width: "${classes}"`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// A screen asks for a shape, it does not build one: formatLondon is the mechanism under
// shared/utils/when.ts, and a bespoke options object is how the two shapes drifted (copy-style §9).
const BUILDS_ITS_OWN = /formatLondon\(/

// What other sweeps own: the show-night screens, the member room pages, the one console file
// whose shapes feed a form, and the shared helpers. The list may shrink and may not grow.
const BUILDS_ITS_OWN_ALLOWED = [
  'app/components/box-office/show/Performances.vue',
  'app/components/till/TicketsPane.vue',
  'app/pages/rooms/index.vue',
  'app/pages/rooms/mine.vue',
  'app/pages/tonight/emergency.vue',
  'app/pages/tonight/glance.vue',
  'app/pages/tonight/till/index.vue',
  'shared/utils/blackouts.ts',
  'shared/utils/list-filters.ts',
  'shared/utils/night-hub.ts',
  'shared/utils/programme.ts',
]

// london.ts declares formatLondon and when.ts is the one caller the rule exists to route through.
const THE_MECHANISM = ['shared/utils/london.ts', 'shared/utils/when.ts']

async function sharedFiles(): Promise<string[]> {
  const glob = new Bun.Glob('**/*.ts')
  return [...glob.scanSync({ cwd: 'shared', onlyFiles: true })]
    .map(path => `shared/${path}`)
    .filter(path => !THE_MECHANISM.includes(path))
    .sort()
}

describe('a date shape comes from the shared helpers (K-127, K-128, issue 1153 item 2)', () => {
  test('no page, component or shared helper builds its own date format', async () => {
    const found: string[] = []
    for (const file of [...await appFiles(), ...await sharedFiles()]) {
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
