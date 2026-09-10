import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

// K-126: the photographs and static assets are real files, encoded within budget, and nothing
// under app/ or content/ points at a picture that is not there.

const PUBLIC = 'public'
const BANNER_MAX_WIDTH = 1920
const BANNER_MAX_BYTES = 300 * 1024
const OG_SIZE = { width: 1200, height: 630 }

// The four pages the story names, and the file each one draws its banner from.
const BANNERED = [
  { page: 'app/pages/index.vue', banner: '/images/nnt-front.webp' },
  { page: 'app/pages/whats-on.vue', banner: '/images/banners/whats-on.webp' },
  { page: 'content/about.md', banner: '/images/banners/about.webp' },
  { page: 'content/get-involved.md', banner: '/images/banners/get-involved.webp' },
]

function files(directory: string, pattern: string): string[] {
  return [...new Bun.Glob(pattern).scanSync({ cwd: directory, onlyFiles: true })]
    .map(path => join(directory, path))
    .sort()
}

async function references(): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>()
  const sources = [...files('app', '**/*.{vue,ts}'), ...files('content', '**/*.md'), 'nuxt.config.ts']
  for (const path of sources) {
    const source = await Bun.file(path).text()
    for (const match of source.matchAll(/\/(?:images\/[\w./-]+|og-default\.png|favicon\.(?:png|ico)|apple-touch-icon\.png)/g)) {
      found.set(match[0], [...found.get(match[0]) ?? [], path])
    }
  }
  return found
}

interface Dimensions { width: number, height: number }

// Enough of PNG and WebP to read a size, so the test needs no image library of its own.
function dimensions(bytes: Uint8Array): Dimensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (at: number, length: number): string => String.fromCharCode(...bytes.subarray(at, at + length))

  if (ascii(1, 3) === 'PNG') {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4)
    if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3FFF, height: view.getUint16(28, true) & 0x3FFF }
    if (chunk === 'VP8L') {
      const b0 = bytes[21]!, b1 = bytes[22]!, b2 = bytes[23]!, b3 = bytes[24]!
      return { width: 1 + (((b1 & 0x3F) << 8) | b0), height: 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)) }
    }
    if (chunk === 'VP8X') {
      const u24 = (at: number): number => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)
      return { width: 1 + u24(24), height: 1 + u24(27) }
    }
  }
  throw new Error(`not a PNG or WebP: ${ascii(0, 4)}`)
}

const read = async (path: string): Promise<Uint8Array> => new Uint8Array(await Bun.file(path).arrayBuffer())

describe('every picture referenced exists (K-126 criterion 5)', () => {
  test('there are references, so a broken pattern cannot pass by finding none', async () => {
    expect((await references()).size).toBeGreaterThan(3)
  })

  test('each reference under app/, content/ and nuxt.config.ts resolves under public/', async () => {
    const missing: string[] = []
    for (const [reference, where] of await references()) {
      if (!await Bun.file(join(PUBLIC, reference)).exists()) missing.push(`${reference} (${where.join(', ')})`)
    }
    expect(missing).toEqual([])
  })
})

describe('the banners are re-encoded, not copied (K-126 criterion 2)', () => {
  const banners = [...files(join(PUBLIC, 'images/banners'), '*'), ...files(join(PUBLIC, 'images'), 'nnt-front.*')]

  test('every banner is present', () => {
    expect(banners.map(path => path.replace(`${PUBLIC}/`, '/'))).toEqual(expect.arrayContaining(BANNERED.map(one => one.banner)))
  })

  test('no original format survives under public/images', () => {
    expect(files(join(PUBLIC, 'images'), '**/*.{jpg,jpeg,JPG,JPEG}')).toEqual([])
  })

  for (const banner of banners) {
    test(`${banner} is WebP or AVIF, at most ${BANNER_MAX_WIDTH} wide and under ${BANNER_MAX_BYTES / 1024} KB`, async () => {
      expect(banner).toMatch(/\.(webp|avif)$/)
      const bytes = await read(banner)
      expect(bytes.byteLength).toBeLessThan(BANNER_MAX_BYTES)
      expect(dimensions(bytes).width).toBeLessThanOrEqual(BANNER_MAX_WIDTH)
    })
  }
})

describe('the favicon, logos and merge source come across (K-126 criterion 1)', () => {
  for (const path of [
    'favicon.png', 'favicon.ico', 'apple-touch-icon.png', '_robots.txt',
    'images/logos/anniversary-grey.png', 'images/logos/anniversary-white.png',
  ]) {
    test(`public/${path} exists`, async () => {
      expect(await Bun.file(join(PUBLIC, path)).exists()).toBe(true)
    })
  }

  test('the SU icon is under app/assets/icons', async () => {
    expect(await Bun.file('app/assets/icons/su.svg').exists()).toBe(true)
  })

  test('the head declares all three icons', async () => {
    const config = await Bun.file('nuxt.config.ts').text()
    for (const href of ['/favicon.png', '/favicon.ico', '/apple-touch-icon.png']) expect(config).toContain(href)
  })

  test('the ICO carries a PNG for the sizes a browser tab asks for', async () => {
    const bytes = await read(join(PUBLIC, 'favicon.ico'))
    const view = new DataView(bytes.buffer)
    expect(view.getUint16(2, true)).toBe(1)
    const sizes = Array.from({ length: view.getUint16(4, true) }, (_, index) => bytes[6 + index * 16])
    expect(sizes).toEqual(expect.arrayContaining([16, 32, 48]))
  })
})

describe('a default Open Graph image exists (K-126 criterion 3)', () => {
  test('public/og-default.png is 1200 by 630', async () => {
    expect(dimensions(await read(join(PUBLIC, 'og-default.png')))).toEqual(OG_SIZE)
  })
})

describe('the four pages draw their banners through NuxtImg behind a scrim (K-126 criterion 4)', () => {
  const HERO = 'app/components/PhotoHero.vue'

  // A markdown page reaches its banner through the catch-all, which is where the hero must be.
  const renderers: Record<string, string> = {
    'content/about.md': 'app/pages/[...slug].vue',
    'content/get-involved.md': 'app/pages/[...slug].vue',
  }

  test('the shared hero puts the scrim between NuxtImg and the words', async () => {
    const source = await Bun.file(HERO).text()
    expect(source).toContain('<NuxtImg')
    expect(source.indexOf('nnt-scrim')).toBeGreaterThan(source.indexOf('<NuxtImg'))
    expect(source.indexOf('<UPageHero')).toBeGreaterThan(source.indexOf('nnt-scrim'))
  })

  for (const { page, banner } of BANNERED) {
    test(`${page} names ${banner} and its renderer draws it through the hero`, async () => {
      expect(await Bun.file(page).text()).toContain(banner)
      expect(await Bun.file(renderers[page] ?? page).text()).toContain('<PhotoHero')
    })
  }
})
