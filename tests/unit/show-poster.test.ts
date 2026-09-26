import { describe, expect, test } from 'bun:test'
import { isPosterKey } from '#shared/utils/seo'
import { IMAGE_TYPES, MAX_IMAGE_BYTES, imageRefusal, posterKeyFor, publishChecklist } from '#shared/utils/programme'
import type { PublishReadiness } from '#shared/utils/programme'

// The poster's pure rules (D-132 criteria 6 and 7). What the route does with them is proved in
// tests/e2e/show-poster.test.ts against the real blob store.

const SHOW_ID = 'show_01HQ'

describe('what may be uploaded as a poster (D-132 criterion 6)', () => {
  test('the three web image types are taken and nothing else is', () => {
    for (const type of IMAGE_TYPES) expect(imageRefusal(type, 1024)).toBeNull()
    expect(imageRefusal('image/gif', 1024)).toContain('JPEG, PNG or WebP')
    expect(imageRefusal('application/pdf', 1024)).toContain('JPEG, PNG or WebP')
    expect(imageRefusal('', 1024)).toContain('JPEG, PNG or WebP')
  })

  test('the size limit is quoted in the refusal rather than left for the reader to guess', () => {
    expect(imageRefusal('image/png', MAX_IMAGE_BYTES)).toBeNull()
    expect(imageRefusal('image/png', MAX_IMAGE_BYTES + 1)).toContain('5 MB')
  })

  test('a poster key sits under the show and is one the public route will serve', () => {
    for (const type of IMAGE_TYPES) {
      const key = posterKeyFor(SHOW_ID, type)
      expect(key.startsWith(`posters/${SHOW_ID}/`)).toBe(true)
      expect(isPosterKey(key)).toBe(true)
    }
  })

  test('two uploads for one show never collide, so a replacement is a new blob', () => {
    const keys = new Set(Array.from({ length: 20 }, () => posterKeyFor(SHOW_ID, 'image/png')))
    expect(keys.size).toBe(20)
  })
})

const ready = (over: Partial<PublishReadiness> = {}): PublishReadiness => ({
  posterUrl: '/posters/show_01HQ/poster.png',
  performanceCount: 3,
  untimedPerformanceCount: 0,
  activePriceCount: 2,
  ...over,
})

describe('the publish checklist reports readiness (D-132 criterion 7)', () => {
  test('four checks, each stated in words, the running time beside the performances (D-121 criterion 6)', () => {
    expect(publishChecklist(ready()).map(check => [check.key, check.says, check.done])).toEqual([
      ['poster', 'Poster uploaded', true],
      ['performances', 'Performances scheduled', true],
      ['running-time', 'Running time set for every performance', true],
      ['pricing', 'Pricing set', true],
    ])
  })

  test('each check turns on its own fact and says so when it is outstanding', () => {
    const missing = (over: Partial<PublishReadiness>) =>
      publishChecklist(ready(over)).filter(check => !check.done).map(check => check.key)
    expect(missing({ posterUrl: null })).toEqual(['poster'])
    expect(missing({ performanceCount: 0 })).toEqual(['performances'])
    expect(missing({ activePriceCount: 0 })).toEqual(['pricing'])
    expect(missing({ untimedPerformanceCount: 2 })).toEqual(['running-time'])
  })

  test('cast list and rights are absent: neither has a schema behind it yet', () => {
    const keys = publishChecklist(ready()).map(check => check.key).join(' ')
    expect(keys).not.toContain('cast')
    expect(keys).not.toContain('rights')
  })
})

// The blob store the poster lands in. `nitro.preset` is Cloudflare in every environment, so
// without the override `nuxt dev` and the end-to-end suite ask for an R2 binding that is not there.
describe('the blob store is the filesystem in development and R2 in production', () => {
  test('the production build still resolves to the R2 driver', async () => {
    const config = await Bun.file('nuxt.config.ts').text()
    expect(config).toContain(`blob: process.env.NODE_ENV === 'production' ? true : { driver: 'fs'`)
    expect(config).toContain(`driver: 'cloudflare-r2'`)
  })

  // Proof rather than inference, when there is a build to read. Skipped otherwise: a unit suite
  // must not depend on a build having happened.
  test('a built output still binds the R2 bucket the poster is served from', async () => {
    const generated = Bun.file('.output/server/wrangler.json')
    if (!await generated.exists()) return

    const config = await generated.json() as { r2_buckets?: { binding: string, bucket_name: string }[] }
    expect(config.r2_buckets).toEqual([{ binding: 'BLOB', bucket_name: 'unified-blob' }])
  })
})
