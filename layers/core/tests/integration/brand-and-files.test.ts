// C-23 (upload one file), C-36 (a safe logo) and C-35 (the brand): an upload is stored, checked and
// cleaned by a job, served only once ready, and used as the logo by a save that needs a fresh
// sign-in and raises the brand's revision.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import upload from '../../server/api/core/files/index.post'
import getFile from '../../server/api/core/files/[id].get'
import patchFile from '../../server/api/core/files/[id].patch'
import getBranding from '../../server/api/core/branding/index.get'
import putBranding from '../../server/api/core/branding/index.put'
import previewBranding from '../../server/api/core/branding/preview.post'
import themeCss from '../../server/api/core/branding/theme.css.get'
import serveFile from '../../server/routes/files/[id].get'
import { runJob } from '#kit/jobs'
import { resetRateLimits } from '#kit/ratelimit'
import { setClock } from '#kit'
import { env, inContext, person, rows, sent, server } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/files': upload,
  'GET /api/core/files/:id': getFile,
  'PATCH /api/core/files/:id': patchFile,
  'GET /api/core/branding': getBranding,
  'PUT /api/core/branding': putBranding,
  'POST /api/core/branding/preview': previewBranding,
  'GET /api/core/branding/theme.css': themeCss,
  'GET /files/:id': serveFile,
})
const designer = person(['core.branding.edit'])

async function deliver(): Promise<string[]> {
  const batch = sent.splice(0)
  const outcomes: string[] = []
  for (const message of batch) outcomes.push(await inContext(() => runJob(message.jobId), { kind: 'job' }))
  return outcomes
}

function send(method: string, path: string, options: { actor?: object, body?: BodyInit | object, type?: string, headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...options.headers }
  if (options.actor) headers['x-test-actor'] = JSON.stringify(options.actor)
  let body: BodyInit | undefined
  if (options.body instanceof Uint8Array || typeof options.body === 'string') {
    headers['content-type'] = options.type ?? 'application/octet-stream'
    body = options.body as BodyInit
  }
  else if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  return handle(new Request(`http://test${path}`, { method, headers, body }))
}

const svgLogo = (inner = '<rect width="10" height="10" fill="#123456"/>') => new TextEncoder().encode(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="200" height="80" inkscape:version="1.3"><metadata>Jo Bloggs</metadata>${inner}</svg>`)

async function uploadLogo(bytes: Uint8Array, slot = 'core.brand-logo') {
  const response = await send('POST', `/api/core/files?slot=${slot}&name=logo.svg`, { actor: designer, body: bytes })
  return { response, body: await response.json() as any }
}

beforeEach(() => {
  sent.length = 0
  resetRateLimits()
})
afterEach(async () => {
  setClock(undefined)
  await env.DB.batch([
    env.DB.prepare("DELETE FROM core_settings WHERE key LIKE 'core.brand.%' OR key LIKE 'core.files.%'"),
    env.DB.prepare('DELETE FROM core_files'),
    env.DB.prepare('DELETE FROM core_jobs'),
  ])
})

describe('uploading a file (C-23)', () => {
  it('stores it, checks it in a job, and serves it only once it is ready', async () => {
    const { response, body } = await uploadLogo(svgLogo())
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ id: expect.stringMatching(/^fil_/), state: 'pending' })
    expect((await send('GET', `/files/${body.id}`)).status).toBe(404)

    expect(await deliver()).toEqual(['done'])
    const served = await send('GET', `/files/${body.id}`)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/svg+xml')
    expect(served.headers.get('content-security-policy')).toContain('sandbox')
    const svg = await served.text()
    expect(svg).not.toContain('Jo Bloggs')
    expect(svg).not.toContain('inkscape')
    const [row] = await rows<any>('SELECT state, media_type, width, height, original_name FROM core_files WHERE id = ?', body.id)
    expect(row).toMatchObject({ state: 'ready', media_type: 'image/svg+xml', width: 200, height: 80, original_name: 'logo.svg' })
    expect(await rows("SELECT name FROM core_events WHERE name = 'core.file.ready'")).toHaveLength(1)
  })

  it('judges the type from the bytes and refuses what the slot does not take', async () => {
    const { body } = await uploadLogo(new TextEncoder().encode('%PDF-1.7 a document called logo.svg'))
    await deliver()
    expect(await rows('SELECT state, rejected_reason FROM core_files WHERE id = ?', body.id)).toEqual([{ state: 'rejected', rejected_reason: 'type-not-accepted' }])
    expect((await send('GET', `/files/${body.id}`)).status).toBe(404)
    const [{ object_key: key }] = await rows<{ object_key: string }>('SELECT object_key FROM core_files WHERE id = ?', body.id) as [{ object_key: string }]
    expect(await env.FILES!.head(key)).toBeNull()
  })

  it('refuses a dangerous SVG with the reason', async () => {
    const { body } = await uploadLogo(svgLogo('<script>alert(1)</script>'))
    await deliver()
    const detail = await (await send('GET', `/api/core/files/${body.id}`, { actor: designer })).json() as any
    expect(detail).toMatchObject({ state: 'rejected', rejectedReason: 'svg-script', url: null })
  })

  it('refuses a file over the slot\'s limit before storing it', async () => {
    const big = new Uint8Array(1024 * 1024 + 1)
    const { response, body } = await uploadLogo(big)
    expect(response.status).toBe(413)
    expect(body.code).toBe('core.files.too-large')
  })

  it('needs the ability the slot names, and a slot that exists', async () => {
    const stranger = await send('POST', '/api/core/files?slot=core.brand-logo', { actor: person([]), body: svgLogo() })
    expect(stranger.status).toBe(403)
    const signedOut = await send('POST', '/api/core/files?slot=core.brand-logo', { body: svgLogo() })
    expect(signedOut.status).toBe(401)
    const nowhere = await send('POST', '/api/core/files?slot=core.nowhere', { actor: designer, body: svgLogo() })
    expect(nowhere.status).toBe(404)
  })

  it('cannot be reached by guessing an address', async () => {
    expect((await send('GET', '/files/logo.svg')).status).toBe(404)
    expect((await send('GET', '/files/fil_aaaaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404)
  })
})

describe('the brand (C-35, C-36)', () => {
  async function readyLogo(alt?: string) {
    const { body } = await uploadLogo(svgLogo())
    await deliver()
    if (alt) await send('PATCH', `/api/core/files/${body.id}`, { actor: designer, body: { altText: alt } })
    return body.id as string
  }

  it('saves a colour and a logo together, raising the revision once and announcing it', async () => {
    const logo = await readyLogo('The Little Theatre')
    const response = await send('PUT', '/api/core/branding', { actor: designer, body: { accent: '#FFFF00', radius: 'large', logo }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ revision: 1, changed: true })
    const brand = await (await send('GET', '/api/core/branding')).json() as any
    expect(brand).toMatchObject({ revision: 1, choice: { accent: '#ffff00', radius: 'large' }, logo: { url: `/files/${logo}`, alt: 'The Little Theatre', width: 200 } })
    expect(await rows("SELECT payload FROM core_events WHERE name = 'core.branding.changed'")).toEqual([{ payload: '{"revision":1}' }])
    const css = await send('GET', '/api/core/branding/theme.css')
    expect(css.headers.get('content-type')).toContain('text/css')
    expect(css.headers.get('cache-control')).toContain('max-age=60')
    expect(await css.text()).toContain('--brand-radius:1rem')
  })

  it('refuses a logo without alt text, and one that is not ready', async () => {
    const logo = await readyLogo()
    const noAlt = await send('PUT', '/api/core/branding', { actor: designer, body: { logo }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(noAlt.status).toBe(422)
    expect((await noAlt.json() as any).code).toBe('core.files.alt-text-required')

    const { body } = await uploadLogo(svgLogo())
    const pending = await send('PUT', '/api/core/branding', { actor: designer, body: { logo: body.id }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(pending.status).toBe(409)
  })

  it('sets the old logo aside when a new one replaces it', async () => {
    const first = await readyLogo('Old')
    await send('PUT', '/api/core/branding', { actor: designer, body: { logo: first }, headers: { 'idempotency-key': crypto.randomUUID() } })
    const second = await readyLogo('New')
    await send('PUT', '/api/core/branding', { actor: designer, body: { logo: second }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(await rows('SELECT id, state FROM core_files ORDER BY state')).toEqual([{ id: first, state: 'deleted' }, { id: second, state: 'ready' }])
  })

  it('asks for a fresh, strong sign-in to save', async () => {
    const stale = person(['core.branding.edit'], { reassertedAt: Date.now() - 86_400_000 })
    const response = await send('PUT', '/api/core/branding', { actor: stale, body: { accent: '#123456' }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.status).toBe(403)
    expect(await rows("SELECT key FROM core_settings WHERE key = 'core.brand.accent'")).toHaveLength(0)
  })

  it('previews a colour in both modes without saving it', async () => {
    const response = await send('POST', '/api/core/branding/preview', { actor: designer, body: { accent: '#fde047' } })
    const preview = await response.json() as any
    expect(preview.tokens.light.link).not.toBe('#fde047')
    expect(preview.tokens.dark.link).toBe('#fde047')
    expect(preview.email.html).toContain(preview.tokens.light.link)
    expect(await rows("SELECT key FROM core_settings WHERE key = 'core.brand.accent'")).toHaveLength(0)
  })
})
