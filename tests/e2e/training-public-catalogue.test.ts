import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-128. The catalogue is read by somebody deciding whether to join, so it answers without an
// account. Signing in adds what they hold and the material links, and changes nothing else.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''
let department = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie
  department = await addDepartment()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const suffix = (): string => crypto.randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

async function addDepartment(): Promise<string> {
  const code = `PUB${suffix()}`
  await send('POST', '/api/admin/training/departments', { code, name: `Public ${code}` })
  return code
}

async function addModule(over: Record<string, unknown> = {}): Promise<string> {
  const id = `PUB-${Math.floor(Math.random() * 900 + 100)}${suffix()}`
  const answered = await send('POST', '/api/admin/training/modules', {
    id,
    department,
    kind: 'MODULE',
    name: 'Working the desk',
    description: 'What the lighting desk does, and how not to break it.',
    status: 'ACTIVE',
    ...over,
  })
  expect(answered.status).toBe(200)
  return id
}

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('the catalogue answers without an account (G-128)', () => {
  test('the list carries an active module and neither a draft nor a retired one', async () => {
    const live = await addModule()
    const draft = await addModule({ status: 'DRAFT' })
    const retired = await addModule({ status: 'RETIRED' })

    const answered = await send('GET', '/api/training/catalogue', undefined, '')
    expect(answered.status).toBe(200)

    const { items, signedIn } = await answered.json() as { items: { id: string }[], signedIn: boolean }
    const ids = items.map(item => item.id)
    expect(signedIn).toBe(false)
    expect(ids).toContain(live)
    expect(ids).not.toContain(draft)
    expect(ids).not.toContain(retired)
  }, CASE_TIMEOUT_MS)

  test('a signed-out reader is given no material link, and a signed-in one is', async () => {
    const id = await addModule()
    write(`INSERT INTO module_materials (id, module_id, label, url, sort) VALUES (?, ?, ?, ?, 0)`,
      `mat-${suffix()}`, id, 'The deck', 'https://drive.example.invalid/deck')

    const anonymous = await (await send('GET', '/api/training/catalogue', undefined, '')).json() as {
      items: { id: string, materials: unknown[], held: boolean | null }[]
    }
    const theirs = anonymous.items.find(item => item.id === id)
    expect(theirs?.materials).toEqual([])
    expect(theirs?.held).toBeNull()

    const member = await (await send('GET', '/api/training/catalogue')).json() as {
      items: { id: string, materials: { label: string, url: string }[] }[]
      signedIn: boolean
    }
    expect(member.signedIn).toBe(true)
    expect(member.items.find(item => item.id === id)?.materials).toEqual([{ label: 'The deck', url: 'https://drive.example.invalid/deck' }])
  }, CASE_TIMEOUT_MS)

  test('the page renders signed out, and a module page with it', async () => {
    const id = await addModule({ name: 'Rigging a lantern' })

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/training/modules`, '[data-test="catalogue-page"]')
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      await waitFor(view, `document.body.innerText.includes('Rigging a lantern')`, 30_000)

      // No sign-in wall, and nothing offering the material to somebody who cannot open it.
      expect(await view.evaluate<boolean>(
        `!!document.querySelector('[data-test="module-materials"]')`,
      )).toBe(false)

      await visit(view, `${app.baseURL}/training/modules/${id}`, '[data-test="module-page"]')
      expect(await textOf(view, '[data-test="module-description"]'))
        .toContain('What the lighting desk does')
      expect(await view.evaluate<boolean>(
        `!!document.querySelector('[data-test="module-sign-in-note"]')`,
      )).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the old catalogue address still arrives somewhere', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/training/catalogue`, '[data-test="catalogue-page"]')
      expect(await view.evaluate<string>('window.location.pathname')).toBe('/training/modules')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
