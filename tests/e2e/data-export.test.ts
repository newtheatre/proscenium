import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { EXPORTED_TABLES } from '#shared/utils/personal-data'
import { markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function send(method: string, path: string, body?: unknown, cookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
}

function write(sql: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(sql).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

function read<T>(sql: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(sql).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

interface Bundle {
  exportedAt: string
  about: { id: string, name: string, email: string }
  sections: Record<string, Record<string, unknown>[]>
  csv: Record<string, string>
}

async function member(prefix: string): Promise<{ id: string, email: string, name: string, cookie: string }> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  await send('POST', '/api/auth/register', { email, name: person.name, password })
  markVerified(app, email)
  const signedIn = await send('POST', '/api/auth/sign-in', { email, password })
  const id = read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!.id
  return { id, email, name: person.name, cookie: (signedIn.headers.get('set-cookie') ?? '').split(';')[0]! }
}

describe.skipIf(skip !== null)('exporting everything held about you (A-124, K-110)', () => {
  test('a signed-out visitor gets nothing', async () => {
    expect((await send('GET', '/api/account/export')).status).toBe(401)
  })

  test('the bundle arrives as a download, not a page', async () => {
    const person = await member('export')
    const response = await send('GET', '/api/account/export', null, person.cookie)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition') ?? '').toContain('attachment')
    expect(response.headers.get('content-disposition') ?? '').toMatch(/nnt-data-\d{4}-\d{2}-\d{2}\.json/)
  })

  // Criterion 5: one pass over one database, so no section can be missing because a call failed.
  test('every section the registry names is present', async () => {
    const person = await member('sections')
    const bundle = await (await send('GET', '/api/account/export', null, person.cookie)).json() as Bundle

    const expected = EXPORTED_TABLES.map(entry => entry.section!).sort()
    expect(Object.keys(bundle.sections).sort()).toEqual(expected)
    expect(Object.keys(bundle.csv).sort()).toEqual(expected)
  })

  test('it carries the person, and their account row', async () => {
    const person = await member('mine')
    const bundle = await (await send('GET', '/api/account/export', null, person.cookie)).json() as Bundle

    expect(bundle.about).toMatchObject({ id: person.id, email: person.email })
    expect(bundle.sections.account).toHaveLength(1)
    expect(bundle.sections.account![0]).toMatchObject({ email: person.email, name: person.name })
  })

  // Criterion 2: only the requester's data, which the query shape enforces rather than a filter
  // somebody has to remember.
  test('it contains nobody else', async () => {
    const person = await member('only-me')
    const stranger = await member('stranger')

    const bundle = await (await send('GET', '/api/account/export', null, person.cookie)).text()
    expect(bundle).not.toContain(stranger.email)
    expect(bundle).not.toContain(stranger.id)
  })

  test('a credential is in no export', async () => {
    const person = await member('credentials')
    const { secret } = await (await send('POST', '/api/account/mfa/enrol', {}, person.cookie)).json() as { secret: string }

    const bundle = await (await send('GET', '/api/account/export', null, person.cookie)).text()
    expect(bundle).not.toContain(secret)
    expect(bundle).not.toContain('totp')
    expect(bundle).not.toContain('token_hash')
  })

  test('the tabular sections come as CSV as well, quoted against a spreadsheet', async () => {
    const person = await member('csv')
    write('UPDATE users SET name = ? WHERE id = ?', '=cmd|calc,"quoted"', person.id)

    const bundle = await (await send('GET', '/api/account/export', null, person.cookie)).json() as Bundle
    const csv = bundle.csv.account!

    expect(csv.split('\r\n')[0]).toContain('"name"')
    // The formula is neutralised and the inner quotes are doubled, so the row survives intact.
    expect(csv).toContain(`"'=cmd|calc,""quoted"""`)
  })

  test('a stored moment is readable rather than a number', async () => {
    const person = await member('dates')
    const bundle = await (await send('GET', '/api/account/export', null, person.cookie)).json() as Bundle
    expect(String(bundle.sections.account![0]!.created_at)).toMatch(/2026/)
  })

  test('the export is audited', async () => {
    const person = await member('audited')
    await send('GET', '/api/account/export', null, person.cookie)

    const entry = read<{ action: string }>(
      'SELECT action FROM audit_log WHERE actor_id = ? AND action = ?', person.id, 'account.exported')
    expect(entry?.action).toBe('account.exported')
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
