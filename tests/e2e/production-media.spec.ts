// A production's poster and photos (C-23, C-24) on its own page in a real browser: an upload is
// checked in the background, described and used; a new poster replaces the old, which can be put
// back; and the section has no accessibility violations in light or dark.
import { deflateSync } from 'node:zlib'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const editor = { kind: 'person', accountId: 'acc_mediaeditor', name: 'Mia Editor', assurance: 'strong', reassertedAt: Date.now(), grants: ['core.production.view', 'core.production.create', 'core.production.edit'].map(grant) }
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

/** A real PNG of one colour, so the browser draws it. */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Buffer) => {
    let c = 0xFFFFFFFF
    for (const b of bytes) c = crcTable[(c ^ b) & 0xFF]! ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).map((_, i) => rgb[i % 3]!)])
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))])
}

let productionId = ''
test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(editor) })
  const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  productionId = (await (await api.post('/api/core/productions', { data: { title: `The Poster Play ${RUN}`, kind: 'own' } })).json()).id
  await api.dispose()
})
test.use(as(editor))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
const upload = (page: Page, part: 'poster' | 'photos', name: string, colour: [number, number, number]) =>
  page.locator(`section[aria-labelledby="${part}-heading"] input[type="file"]`).setInputFiles({ name, mimeType: 'image/png', buffer: png(60, 90, colour) })

test('a poster is uploaded, described and used, replaced, and put back', async ({ page }) => {
  await visit(page, `/console/programme/productions/${productionId}`)
  const media = page.getByRole('main')
  await upload(page, 'poster', 'first.png', [180, 30, 40])
  await media.getByRole('textbox', { name: /Describe the poster/ }).fill('A red curtain')
  await media.getByRole('button', { name: 'Use as the poster' }).click()
  await expect(media.getByRole('img', { name: 'A red curtain' })).toBeVisible()

  await upload(page, 'poster', 'second.png', [30, 60, 180])
  await media.getByRole('textbox', { name: /Describe the poster/ }).fill('A blue sky')
  await media.getByRole('button', { name: 'Use as the poster' }).click()
  await expect(media.getByRole('img', { name: 'A blue sky' })).toBeVisible()
  await expect(media.getByRole('img', { name: 'A red curtain' })).toHaveCount(0)

  await media.getByRole('button', { name: /Recently removed/ }).click()
  await media.getByRole('button', { name: 'Put back' }).click()
  await expect(media.getByRole('img', { name: 'A red curtain' })).toBeVisible()
})

test('photos are added and moved, with no accessibility violations in light and dark', async ({ page }) => {
  await visit(page, `/console/programme/productions/${productionId}`)
  const media = page.getByRole('main')
  for (const [name, colour, alt] of [['one.png', [20, 120, 60], 'The cast bowing'], ['two.png', [200, 160, 20], 'The set in gold light']] as const) {
    await upload(page, 'photos', name, [...colour])
    await media.getByRole('textbox', { name: /Describe the photo/ }).fill(alt)
    await media.getByRole('button', { name: 'Add to the photos' }).click()
    await expect(media.getByRole('img', { name: alt })).toBeVisible()
  }
  const order = () => page.locator('section[aria-labelledby="photos-heading"] li img').evaluateAll(images => images.map(i => i.getAttribute('alt')))
  expect(await order()).toEqual(['The cast bowing', 'The set in gold light'])
  await media.getByRole('button', { name: 'Move photo 2 earlier' }).click()
  await expect.poll(order).toEqual(['The set in gold light', 'The cast bowing'])
  await noViolations(page)
  await page.screenshot({ path: 'test-results/production-media-light.png', fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await noViolations(page)
  await page.screenshot({ path: 'test-results/production-media-dark.png', fullPage: true })
})
