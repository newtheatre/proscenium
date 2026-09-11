import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { imageMeta } from 'image-meta'
import { createImage } from '@nuxt/image/runtime'
import cloudflare from '@nuxt/image/runtime/providers/cloudflare'

// K-126: the photographs and static assets are real files, encoded within budget, and nothing
// under app/ or content/ points at a picture that is not there.

const PUBLIC = 'public'
const HERO = 'app/components/PhotoHero.vue'
const BANNER_MAX_WIDTH = 1920
const BANNER_MAX_BYTES = 300 * 1024
const OG_SIZE = { width: 1200, height: 630 }
// Below this a srcset candidate is a thumbnail, not a hero: the smallest screen @nuxt/image knows.
const SMALLEST_HERO_WIDTH = 320

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

// A path with an extension, so prose ending "/images/banners." is not read as a reference.
const REFERENCE = /\/(?:images\/[\w-]+(?:\/[\w-]+)*\.[a-z0-9]+|og-default\.png|favicon\.(?:png|ico)|apple-touch-icon\.png)\b/g

async function references(): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>()
  const sources = [...files('app', '**/*.{vue,ts}'), ...files('content', '**/*.md'), 'nuxt.config.ts']
  for (const path of sources) {
    const source = await Bun.file(path).text()
    for (const match of source.matchAll(REFERENCE)) {
      found.set(match[0], [...found.get(match[0]) ?? [], path])
    }
  }
  return found
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
      const bytes = await read(banner)
      const meta = imageMeta(bytes)
      expect(['webp', 'avif']).toContain(meta.type ?? '')
      expect(bytes.byteLength).toBeLessThan(BANNER_MAX_BYTES)
      expect(meta.width).toBeLessThanOrEqual(BANNER_MAX_WIDTH)
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

  test('the ICO carries the sizes a browser tab asks for', async () => {
    const meta = imageMeta(await read(join(PUBLIC, 'favicon.ico')))
    expect(meta.type).toBe('ico')
    expect((meta.images ?? []).map(image => image.width)).toEqual(expect.arrayContaining([16, 32, 48]))
  })

  test('the touch icon is the 180 pixel square Safari asks for', async () => {
    expect(imageMeta(await read(join(PUBLIC, 'apple-touch-icon.png')))).toMatchObject({ type: 'png', width: 180, height: 180 })
  })
})

describe('a default Open Graph image exists (K-126 criterion 3)', () => {
  test('public/og-default.png is 1200 by 630', async () => {
    expect(imageMeta(await read(join(PUBLIC, 'og-default.png')))).toMatchObject({ type: 'png', ...OG_SIZE })
  })

  test('the app declares it as the image for a shared link', async () => {
    expect(await Bun.file('app/app.vue').text()).toContain('ogImage: \'/og-default.png\'')
  })
})

describe('the four pages draw their banners through NuxtImg behind a scrim (K-126 criterion 4)', () => {
  // A markdown page reaches its banner through the catch-all, which is where the hero must be.
  const renderers: Record<string, string> = {
    'content/about.md': 'app/pages/[...slug].vue',
    'content/get-involved.md': 'app/pages/[...slug].vue',
  }

  const attribute = (tag: string, name: string): string => {
    const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`))
    return match?.[1] ?? ''
  }

  test('the hero stacks the picture, then the scrim, then the words, in one stacking context', async () => {
    const source = await Bun.file(HERO).text()
    const image = source.match(/<NuxtImg[\s\S]*?\/>/)?.[0] ?? ''
    const scrim = source.match(/<div[^>]*nnt-scrim[^>]*\/>/)?.[0] ?? ''
    const root = source.match(/<div[^>]*data-test="photo-hero"[^>]*>/)?.[0] ?? ''
    expect(attribute(image, 'class').split(/\s+/)).toContain('-z-20')
    expect(attribute(scrim, 'class').split(/\s+/)).toContain('-z-10')
    expect(attribute(root, 'class').split(/\s+/)).toEqual(expect.arrayContaining(['isolate', 'relative', 'dark']))
  })

  test('nothing under app/ scrims a photograph except the hero', async () => {
    const elsewhere: string[] = []
    for (const path of files('app', '**/*.{vue,ts}')) {
      if (path !== HERO && (await Bun.file(path).text()).includes('nnt-scrim')) elsewhere.push(path)
    }
    expect(elsewhere).toEqual([])
  })

  for (const { page, banner } of BANNERED) {
    test(`${page} names ${banner} and its renderer draws it through the hero`, async () => {
      expect(await Bun.file(page).text()).toContain(banner)
      expect(await Bun.file(renderers[page] ?? page).text()).toContain('<PhotoHero')
    })
  }
})

describe('the hero srcset is built for real screens under the production provider', () => {
  // @nuxt/image files a breakpoint-less `sizes` under a 1px screen, and every candidate is then
  // one or two pixels wide. The value is read from the component so the test pins what ships.
  test('no candidate width is below the smallest screen', async () => {
    const source = await Bun.file(HERO).text()
    const sizes = source.match(/const SIZES = '([^']+)'/)?.[1] ?? ''
    expect(sizes).not.toBe('')

    const img = createImage({
      provider: 'cloudflare',
      providers: { cloudflare: { setup: cloudflare, defaults: { baseURL: '/' } } },
      nuxt: { baseURL: '/' },
      runtimeConfig: { public: {} },
      presets: {},
      screens: { 'xs': 320, 'sm': 640, 'md': 768, 'lg': 1024, 'xl': 1280, '2xl': 1536 },
      densities: [1, 2],
      domains: [],
      alias: {},
      format: [],
    })
    const built = img.getSizes('/images/nnt-front.webp', { sizes, modifiers: { format: 'auto' } })
    // Matched by descriptor rather than split on commas: the Cloudflare URL carries commas itself.
    const widths = [...built.srcset.matchAll(/ (\d+)w(?:,|$)/g)].map(match => Number(match[1]))

    expect(widths.length).toBeGreaterThan(1)
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(SMALLEST_HERO_WIDTH)
    expect(built.src).toContain('/cdn-cgi/image/')
  })
})
