import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-132 criterion 6 against the real blob store, which under the harness is the NuxtHub
// development filesystem: the upload, the public serve and the removal are one round trip.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let boxOffice: TestMember
let venueId: string
const boxOfficePassword = generatePassword()

// The smallest PNG that is still a PNG: one transparent pixel, so the fixture is bytes and not
// a file somebody has to keep beside the suite.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  boxOffice = await registerMember(app, 'boxoffice', boxOfficePassword)
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'FOH_MANAGER' }, officer.cookie)

  const database = new Database(app.databaseFile)
  try {
    venueId = testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8) }).id
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function upload(showId: string, bytes: Uint8Array, type: string, name = 'poster.png', as = officer.cookie): Promise<Response> {
  const form = new FormData()
  form.append('poster', new Blob([bytes as unknown as BlobPart], { type }), name)
  return fetch(`${app.baseURL}/api/admin/shows/${showId}/poster`, {
    method: 'POST',
    headers: { cookie: as },
    body: form,
  })
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

async function newShow(): Promise<{ id: string, slug: string, title: string }> {
  const title = named('Poster show')
  const slug = slugged(title)
  const answered = await send('POST', '/api/admin/shows', { title, slug })
  expect(answered.status).toBe(200)
  return { id: (await answered.json() as { id: string }).id, slug, title }
}

async function showDetail(id: string): Promise<{ posterUrl: string | null }> {
  const answered = await send('GET', `/api/admin/shows/${id}`)
  expect(answered.status).toBe(200)
  return (await answered.json() as { show: { posterUrl: string | null } }).show
}

function posterKeys(showId: string): string[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query('SELECT poster_key AS key FROM shows WHERE id = ?').all(showId) as { key: string | null }[])
      .map(row => row.key ?? '')
  }
  finally {
    database.close()
  }
}

function trail(action: string, target: string): number {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const row = database.query('SELECT count(*) AS total FROM audit_log WHERE action = ? AND target = ?')
      .get(action, target) as { total: number }
    return row.total
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a show takes a poster and the public page draws it (D-132 criterion 6)', () => {
  test('an upload writes the key, serves the bytes and records the change', async () => {
    const show = await newShow()
    const answered = await upload(show.id, PIXEL_PNG, 'image/png')
    expect(answered.status).toBe(200)

    const { posterUrl } = await answered.json() as { posterUrl: string }
    expect(posterUrl.startsWith(`/posters/${show.id}/`)).toBe(true)
    expect(posterKeys(show.id)).toEqual([posterUrl.slice(1)])
    expect((await showDetail(show.id)).posterUrl).toBe(posterUrl)
    expect(trail('show.poster.uploaded', `show:${show.id}`)).toBe(1)

    const served = await fetch(`${app.baseURL}${posterUrl}`)
    expect(served.status).toBe(200)
    expect((await served.bytes()).length).toBe(PIXEL_PNG.length)
  }, 120_000)

  test('replacing repoints the row and leaves nothing serving the old key', async () => {
    const show = await newShow()
    const first = (await (await upload(show.id, PIXEL_PNG, 'image/png')).json() as { posterUrl: string }).posterUrl
    const second = (await (await upload(show.id, PIXEL_PNG, 'image/png')).json() as { posterUrl: string }).posterUrl

    expect(second).not.toBe(first)
    expect(posterKeys(show.id)).toEqual([second.slice(1)])
    expect((await fetch(`${app.baseURL}${first}`)).status).toBe(404)
    expect((await fetch(`${app.baseURL}${second}`)).status).toBe(200)
  }, 120_000)

  test('removing clears the key and the blob, and is audited', async () => {
    const show = await newShow()
    const { posterUrl } = await (await upload(show.id, PIXEL_PNG, 'image/png')).json() as { posterUrl: string }

    expect((await send('DELETE', `/api/admin/shows/${show.id}/poster`)).status).toBe(200)
    expect(posterKeys(show.id)).toEqual([''])
    expect((await showDetail(show.id)).posterUrl).toBeNull()
    expect((await fetch(`${app.baseURL}${posterUrl}`)).status).toBe(404)
    expect(trail('show.poster.removed', `show:${show.id}`)).toBe(1)
  }, 120_000)

  test('a type nobody may upload is refused, and the refusal names what is allowed', async () => {
    const show = await newShow()
    const answered = await upload(show.id, PIXEL_PNG, 'image/gif', 'poster.gif')
    expect(answered.status).toBe(400)
    expect((await answered.json() as { message?: string }).message).toContain('JPEG, PNG or WebP')
    expect(posterKeys(show.id)).toEqual([''])
  }, 120_000)

  test('a reader of the box office may not change a show\'s artwork', async () => {
    const show = await newShow()
    const stranger = await registerMember(app, 'poster-stranger', generatePassword())
    expect((await upload(show.id, PIXEL_PNG, 'image/png', 'poster.png', stranger.cookie)).status).toBe(403)
  }, 120_000)

  test('the public show page draws the poster once there is one, and its gradient until then', async () => {
    const show = await newShow()
    await send('POST', `/api/admin/shows/${show.id}/performances`, {
      venueId,
      startsAt: Math.floor(Date.now() / 1000) + 7 * 86_400,
    })
    expect((await send('POST', `/api/admin/shows/${show.id}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/shows/${show.slug}`, '[data-test="poster-none"]')

    await upload(show.id, PIXEL_PNG, 'image/png')
    await visit(view, `${app.baseURL}/shows/${show.slug}`, '[data-test="poster-art"]')
    view.close()
  }, 180_000)

  test('the poster card uploads, previews and removes from the screen', async () => {
    const show = await newShow()
    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', boxOffice.email)
    await fill(view, 'form input[type="password"]', boxOfficePassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

    await visit(view, `${app.baseURL}/box-office/shows/${show.id}`, '[data-test="poster-card"]')
    expect(await textOf(view, '[data-test="poster-card"]')).toContain('Show art is sovereign')
    expect(await textOf(view, '[data-test="publish-checklist"]')).toContain('Poster uploaded')

    await upload(show.id, PIXEL_PNG, 'image/png')
    await visit(view, `${app.baseURL}/box-office/shows/${show.id}`, '[data-test="poster-art"]')
    await click(view, '[data-test="poster-remove"]')
    await waitFor(view, `document.querySelector('[data-test="confirm-poster-remove"]')`)
    await click(view, '[data-test="confirm-poster-remove"]')
    await waitFor(view, `document.querySelector('[data-test="poster-none"]')`)

    expect(posterKeys(show.id)).toEqual([''])
    view.close()
  }, 180_000)
})
