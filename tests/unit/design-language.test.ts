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
