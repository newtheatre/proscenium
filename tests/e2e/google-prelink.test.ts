import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { expectOneWinner } from '#tests/helpers/race'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// Pre-linking a Workspace address to an account from the console, end to end (A-104 criterion 6,
// 0008). Google's own round trip cannot run here; the callback's lookup is proved in integration.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(83), email: registrableAddress('prelink-officer') }
let cookie = ''
let secret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()

  await send('POST', '/api/auth/register', { email: officer.email, name: officer.name, password })
  markVerified(app, officer.email)
  const signedIn = await send('POST', '/api/auth/sign-in', { email: officer.email, password })
  const first = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
  secret = (await (await send('POST', '/api/account/mfa/enrol', {}, first)).json() as { secret: string }).secret
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, first)

  expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', officer.email, app.databaseFile]).exitCode).toBe(0)
  forgetSpentStep(app, officer.email)
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: officer.email, password })).json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', { attemptId, code: await codeForStep(secret, stepFor(new Date())) })
  cookie = (answered.headers.get('set-cookie') ?? '').split(';')[0]!
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function send(method: string, path: string, body?: unknown, withCookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(withCookie ? { cookie: withCookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
}

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

// Setup only: a Google link cannot be made here without Google.
function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

interface Person { id: string, name: string, email: string, cookie: string }

async function person(prefix: string): Promise<Person> {
  const { name } = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  await send('POST', '/api/auth/register', { email, name, password })
  markVerified(app, email)
  const signedIn = await send('POST', '/api/auth/sign-in', { email, password })
  const id = read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!.id
  return { id, name, email, cookie: (signedIn.headers.get('set-cookie') ?? '').split(';')[0]! }
}

const workspace = (prefix: string): string => `${prefix}-${crypto.randomUUID().slice(0, 8)}@newtheatre.org.uk`

const link = (id: string, googleEmail: string | null, withCookie = cookie): Promise<Response> =>
  send('PATCH', `/api/admin/accounts/${id}/google-link`, { googleEmail }, withCookie)

const pendingOf = (id: string): string | null =>
  read<{ pending: string | null }>('SELECT pending_google_email AS pending FROM users WHERE id = ?', id)!.pending

describe.skipIf(skip !== null)('pre-linking a Workspace address (A-104 criterion 6)', () => {
  test('sets it lowercased, keeps the account\'s own address, and audits no address', async () => {
    const incoming = await person('prelink-set')
    const address = workspace('incoming')
    const response = await link(incoming.id, `  ${address.toUpperCase()} `)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, googleEmail: address })
    expect(pendingOf(incoming.id)).toBe(address)
    expect(read<{ email: string }>('SELECT email FROM users WHERE id = ?', incoming.id)!.email).toBe(incoming.email)

    const entry = read<{ detail: string | null }>('SELECT detail FROM audit_log WHERE target = ? AND action = ?', `user:${incoming.id}`, 'account.google.prelinked')!
    expect(entry.detail ?? '').not.toContain('@')
  })

  test('clears it, and audits the clearing', async () => {
    const incoming = await person('prelink-clear')
    expect((await link(incoming.id, workspace('clear'))).status).toBe(200)
    expect((await link(incoming.id, null)).status).toBe(200)
    expect(pendingOf(incoming.id)).toBeNull()
    expect(read('SELECT id FROM audit_log WHERE target = ? AND action = ?', `user:${incoming.id}`, 'account.google.unlinked')).toBeDefined()
  })

  test('a personal address is refused', async () => {
    const incoming = await person('prelink-personal')
    expect((await link(incoming.id, registrableAddress('personal'))).status).toBe(400)
    expect(pendingOf(incoming.id)).toBeNull()
  })

  test('an address that is another account\'s own is refused, naming it and pointing to merge', async () => {
    const incoming = await person('prelink-taken')
    const address = workspace('taken')
    write('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', crypto.randomUUID().replaceAll('-', ''), address, 'Workspace Holder')
    const response = await link(incoming.id, address)
    expect(response.status).toBe(409)
    const said = (await response.json() as { statusMessage?: string }).statusMessage ?? ''
    expect(said).toContain('Workspace Holder')
    expect(said).toMatch(/merge/i)
    expect(pendingOf(incoming.id)).toBeNull()
  })

  test('an address already pre-linked to another account is refused, naming it', async () => {
    const first = await person('prelink-first')
    const second = await person('prelink-second')
    const address = workspace('pending')
    expect((await link(first.id, address)).status).toBe(200)
    const response = await link(second.id, address)
    expect(response.status).toBe(409)
    expect((await response.json() as { statusMessage?: string }).statusMessage ?? '').toContain(first.name)
    expect(pendingOf(second.id)).toBeNull()
  })

  test('an account already linked to Google is refused', async () => {
    const linked = await person('prelink-linked')
    write('UPDATE users SET google_sub = ? WHERE id = ?', `sub-${linked.id}`, linked.id)
    expect((await link(linked.id, workspace('linked'))).status).toBe(409)
    expect(pendingOf(linked.id)).toBeNull()
  })

  test('two administrators pre-linking one address to two accounts: exactly one wins', async () => {
    const first = await person('prelink-race-a')
    const second = await person('prelink-race-b')
    const address = workspace('race')
    const answers = await Promise.all([link(first.id, address), link(second.id, address)])
    expectOneWinner(answers)
    const holders = [pendingOf(first.id), pendingOf(second.id)].filter(held => held === address)
    expect(holders).toHaveLength(1)
  })

  test('needs accounts.create', async () => {
    const member = await person('prelink-member')
    const target = await person('prelink-target')
    expect((await link(target.id, workspace('forbidden'), member.cookie)).status).toBe(403)
    expect(pendingOf(target.id)).toBeNull()
  })

  test('an account that does not exist is a 404', async () => {
    expect((await link('no-such-account', workspace('nobody'))).status).toBe(404)
  })
})
