// C-23 and C-24 on a production: a poster and photos are uploaded into its slots, checked, described
// and then used; a new poster replaces the old in one step, so there is never none, and the old one
// can be put back while its restore period lasts; photos keep the order the theatre gives them.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import upload from '../../server/api/core/files/index.post'
import patchFile from '../../server/api/core/files/[id].patch'
import createProduction from '../../server/api/core/productions/index.post'
import getMedia from '../../server/api/core/productions/[id]/media/index.get'
import useMedia from '../../server/api/core/productions/[id]/media/index.post'
import orderPhotos from '../../server/api/core/productions/[id]/media/order.put'
import removeMedia from '../../server/api/core/productions/[id]/media/[fileId]/index.delete'
import restoreMedia from '../../server/api/core/productions/[id]/media/[fileId]/restore.post'
import serveFile from '../../server/routes/files/[id].get'
import { runJob } from '#kit/jobs'
import { resetRateLimits } from '#kit/ratelimit'
import { env, inContext, person, sent, server } from '../../../../tests/integration/helpers'

const handle = server({
  'POST /api/core/files': upload,
  'PATCH /api/core/files/:id': patchFile,
  'POST /api/core/productions': createProduction,
  'GET /api/core/productions/:id/media': getMedia,
  'POST /api/core/productions/:id/media': useMedia,
  'PUT /api/core/productions/:id/media/order': orderPhotos,
  'DELETE /api/core/productions/:id/media/:fileId': removeMedia,
  'POST /api/core/productions/:id/media/:fileId/restore': restoreMedia,
  'GET /files/:id': serveFile,
})
const editor = person(['core.production.create', 'core.production.edit'])
const viewer = person(['core.production.view'])

async function deliver() {
  for (const message of sent.splice(0)) await inContext(() => runJob(message.jobId), { kind: 'job' })
}
function send(method: string, path: string, options: { actor?: object, body?: Uint8Array | object } = {}) {
  const headers: Record<string, string> = {}
  if (options.actor) headers['x-test-actor'] = JSON.stringify(options.actor)
  let body: BodyInit | undefined
  if (options.body instanceof Uint8Array) {
    headers['content-type'] = 'application/octet-stream'
    body = options.body as BodyInit
  }
  else if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  return handle(new Request(`http://test${path}`, { method, headers, body }))
}
async function json(r: Promise<Response>) {
  const response = await r
  return { status: response.status, body: await response.json() as any }
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const ascii = (s: string) => [...s].map(c => c.charCodeAt(0))
function png(width = 600, height = 900) {
  const chunk = (type: string, data: number[]) => [...u32(data.length), ...ascii(type), ...data, 0, 0, 0, 0]
  return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...chunk('IHDR', [...u32(width), ...u32(height), 8, 6, 0, 0, 0]), ...chunk('IDAT', [1, 2, 3]), ...chunk('IEND', [])])
}

let n = 0
async function production() {
  return (await json(send('POST', '/api/core/productions', { actor: editor, body: { title: `With a poster ${++n}`, kind: 'own' } }))).body.id as string
}
/** Uploads an image into the production's slot, lets the check run and describes it. */
async function ready(productionId: string, slot: 'poster' | 'photos', alt: string | null = 'The cast on stage') {
  const { body } = await json(send('POST', `/api/core/files?slot=core.production-${slot}&owner=${productionId}&name=image.png`, { actor: editor, body: png() }))
  await deliver()
  if (alt) await send('PATCH', `/api/core/files/${body.id}`, { actor: editor, body: { altText: alt } })
  return body.id as string
}
const media = async (productionId: string, actor = viewer) => (await json(send('GET', `/api/core/productions/${productionId}/media`, { actor }))).body
const use = (productionId: string, fileId: string) => json(send('POST', `/api/core/productions/${productionId}/media`, { actor: editor, body: { fileId } }))

beforeEach(() => {
  sent.length = 0
  resetRateLimits()
})
afterEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM core_files'), env.DB.prepare('DELETE FROM core_jobs')])
})

describe('a production\'s poster (C-23, C-24)', () => {
  it('is uploaded, checked, described and then used; an undescribed image is refused', async () => {
    const id = await production()
    const bare = await ready(id, 'poster', null)
    expect((await media(id)).waiting).toMatchObject([{ id: bare, state: 'ready', altText: null }])
    expect((await use(id, bare)).body.code).toBe('core.files.alt-text-required')
    await send('PATCH', `/api/core/files/${bare}`, { actor: editor, body: { altText: 'A red curtain' } })
    expect((await use(id, bare)).status).toBe(200)
    const after = await media(id)
    expect(after.poster).toMatchObject({ id: bare, url: `/files/${bare}`, altText: 'A red curtain', width: 600, height: 900 })
    expect(after.waiting).toEqual([])
    expect((await send('GET', `/files/${bare}`)).status).toBe(200)
  })

  it('is replaced in one step, and the old one can be put back while its restore period lasts', async () => {
    const id = await production()
    const first = await ready(id, 'poster')
    await use(id, first)
    const second = await ready(id, 'poster', 'The second poster')
    await use(id, second)
    let now = await media(id)
    expect(now.poster.id).toBe(second)
    expect(now.removed).toMatchObject([{ id: first, state: 'deleted', restorableUntil: expect.any(Number) }])
    expect((await send('GET', `/files/${first}`)).status).toBe(404)

    expect((await json(send('POST', `/api/core/productions/${id}/media/${first}/restore`, { actor: editor }))).status).toBe(200)
    now = await media(id)
    expect(now.poster.id).toBe(first)
    expect(now.removed.map((f: { id: string }) => f.id)).toEqual([second])
  })

  it('needs the edit ability on the production, and another production\'s file is not found', async () => {
    const id = await production()
    const other = await production()
    const file = await ready(other, 'poster')
    expect((await use(id, file)).body.code).toBe('core.files.not-found')
    expect((await json(send('POST', `/api/core/productions/${other}/media`, { actor: viewer, body: { fileId: file } }))).status).toBe(403)
    const upload = await send('POST', `/api/core/files?slot=core.production-poster&owner=${id}`, { actor: viewer, body: png() })
    expect(upload.status).toBe(403)
  })
})

describe('a production\'s photos', () => {
  it('are added after the last one, put in the order given, and taken off', async () => {
    const id = await production()
    const [a, b, c] = [await ready(id, 'photos', 'One'), await ready(id, 'photos', 'Two'), await ready(id, 'photos', 'Three')]
    for (const file of [a, b, c]) await use(id, file)
    expect((await media(id)).photos.map((p: { id: string }) => p.id)).toEqual([a, b, c])

    expect((await json(send('PUT', `/api/core/productions/${id}/media/order`, { actor: editor, body: { fileIds: [c, a, b] } }))).status).toBe(200)
    expect((await media(id)).photos.map((p: { id: string }) => p.id)).toEqual([c, a, b])
    // An order that leaves one out was made against a list that has since changed.
    expect((await json(send('PUT', `/api/core/productions/${id}/media/order`, { actor: editor, body: { fileIds: [c, a] } }))).body.code).toBe('core.production.photos-changed')

    await send('DELETE', `/api/core/productions/${id}/media/${a}`, { actor: editor })
    const after = await media(id)
    expect(after.photos.map((p: { id: string }) => p.id)).toEqual([c, b])
    expect(after.removed.map((p: { id: string }) => p.id)).toEqual([a])
    // A photo put back keeps the photos there are: many may be in use at once.
    await send('POST', `/api/core/productions/${id}/media/${a}/restore`, { actor: editor })
    expect((await media(id)).photos).toHaveLength(3)
  })

  it('lists a refused upload until it is dismissed', async () => {
    const id = await production()
    const { body } = await json(send('POST', `/api/core/files?slot=core.production-photos&owner=${id}&name=notes.txt`, { actor: editor, body: new TextEncoder().encode('not an image') }))
    await deliver()
    expect((await media(id)).waiting).toMatchObject([{ id: body.id, state: 'rejected', rejectedReason: 'type-not-accepted' }])
    await send('DELETE', `/api/core/productions/${id}/media/${body.id}`, { actor: editor })
    expect((await media(id)).waiting).toEqual([])
  })
})
