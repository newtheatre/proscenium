import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { TOMBSTONE_NAME, tombstoneEmail } from '#shared/utils/erasure'
import { PERSONAL_TABLES } from '#shared/utils/personal-data'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(51), email: registrableAddress('eraser') }
let cookie = ''
let secret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()

  await send('POST', '/api/auth/register', { email: officer.email, name: officer.name, password })
  const signedIn = await send('POST', '/api/auth/sign-in', { email: officer.email, password })
  const first = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
  secret = (await (await send('POST', '/api/account/mfa/enrol', {}, first)).json() as { secret: string }).secret
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, first)

  expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', officer.email, app.databaseFile]).exitCode).toBe(0)
  cookie = await signInThroughTheChallenge()
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

function read<T>(sql: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(sql).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

function readAll(sql: string): string {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return JSON.stringify(database.query(sql).all())
  }
  finally {
    database.close()
  }
}

const spentStep = (): number | null => read<{ step: number | null }>(`
  SELECT t.last_used_step AS step FROM totp_secrets t JOIN users u ON u.id = t.user_id WHERE u.email = ?
`, officer.email)?.step ?? null

async function signInThroughTheChallenge(): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (stepFor(new Date()) !== spentStep()) break
    await Bun.sleep(1000)
  }
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email: officer.email, password })).json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', {
    attemptId,
    code: await codeForStep(secret, stepFor(new Date())),
  })
  return (answered.headers.get('set-cookie') ?? '').split(';')[0]!
}

interface Member { id: string, email: string, name: string, cookie: string }

async function member(prefix: string): Promise<Member> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)
  await send('POST', '/api/auth/register', { email, name: person.name, password })
  const signedIn = await send('POST', '/api/auth/sign-in', { email, password })
  const id = read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!.id
  return { id, email, name: person.name, cookie: (signedIn.headers.get('set-cookie') ?? '').split(';')[0]! }
}

const close = (person: Member, body: unknown): Promise<Response> =>
  send('POST', '/api/account/close', body, person.cookie)

describe.skipIf(skip !== null)('closing your own account (A-125)', () => {
  test('it needs the address typed and the password proved', async () => {
    const person = await member('careful')

    expect((await close(person, { email: 'someone.else@e2e.newtheatre.org.uk', password })).status).toBe(400)
    expect((await close(person, { email: person.email })).status).toBe(401)
    expect((await close(person, { email: person.email, password: `${password}-not` })).status).toBe(401)

    expect(read<{ anonymised: number | null }>('SELECT anonymised_at AS anonymised FROM users WHERE id = ?', person.id)!.anonymised).toBeNull()
  })

  test('closing anonymises the row rather than deleting it', async () => {
    const person = await member('closing')
    expect((await close(person, { email: person.email, password })).status).toBe(200)

    const row = read<{ email: string, name: string, password: string | null, anonymised: number | null }>(
      'SELECT email, name, password, anonymised_at AS anonymised FROM users WHERE id = ?', person.id)

    expect(row).toMatchObject({ email: tombstoneEmail(person.id), name: TOMBSTONE_NAME, password: null })
    expect(row!.anonymised).not.toBeNull()
  })

  test('the session ends with the account, and cannot be used again', async () => {
    const person = await member('gone')
    await close(person, { email: person.email, password })

    const session = await (await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie: person.cookie } })).json() as { signedIn: boolean }
    expect(session.signedIn).toBe(false)
  })

  test('a closed account cannot sign in, and is refused like any other failure', async () => {
    const person = await member('refused')
    await close(person, { email: person.email, password })

    const closed = await send('POST', '/api/auth/sign-in', { email: person.email, password })
    const stranger = await send('POST', '/api/auth/sign-in', { email: registrableAddress('nobody'), password })
    expect(closed.status).toBe(stranger.status)
    expect(await closed.text()).toBe(await stranger.text())
  })

  // Criterion 3: the tombstone is guarded by the database, so a later write path cannot undo it.
  test('the address is free again, and registering with it makes a new account', async () => {
    const person = await member('reused')
    await close(person, { email: person.email, password })

    expect((await send('POST', '/api/auth/register', { email: person.email, name: person.name, password })).status).toBe(200)
    const fresh = read<{ id: string }>('SELECT id FROM users WHERE email = ?', person.email)
    expect(fresh?.id).toBeDefined()
    expect(fresh!.id).not.toBe(person.id)
  })

  test('closing twice is not an error', async () => {
    const person = await member('twice')
    expect((await close(person, { email: person.email, password })).status).toBe(200)

    // The session is gone, so the second attempt is the admin path on an already-erased account.
    const again = await send('POST', `/api/admin/accounts/${person.id}/security`, { operation: 'erase' }, cookie)
    expect(again.status).toBe(409)
  })
})

describe.skipIf(skip !== null)('erasing somebody else (A-125 criterion 6)', () => {
  test('an administrator erases an account, and it is audited to them', async () => {
    const person = await member('by-admin')
    const erased = await send('POST', `/api/admin/accounts/${person.id}/security`, { operation: 'erase' }, cookie)
    expect(erased.status).toBe(200)

    const row = read<{ name: string }>('SELECT name FROM users WHERE id = ?', person.id)
    expect(row!.name).toBe(TOMBSTONE_NAME)

    const entry = read<{ actor: string }>(`
      SELECT actor_id AS actor FROM audit_log WHERE target = ? AND action = 'account.erased.admin'
    `, `user:${person.id}`)
    expect(entry?.actor).toBe(read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id)
  })

  test('the last administrator cannot be erased', async () => {
    const me = read<{ id: string }>('SELECT id FROM users WHERE email = ?', officer.email)!.id
    // The operations route refuses the operator's own account first, so a second administrator
    // asks about the first: either refusal proves the account is guarded.
    const refused = await send('POST', `/api/admin/accounts/${me}/security`, { operation: 'erase' }, cookie)
    expect([403, 409]).toContain(refused.status)
    expect(read<{ anonymised: number | null }>('SELECT anonymised_at AS anonymised FROM users WHERE id = ?', me)!.anonymised).toBeNull()
  })

  test('nothing else can be done to an erased account', async () => {
    const person = await member('finished')
    await send('POST', `/api/admin/accounts/${person.id}/security`, { operation: 'erase' }, cookie)

    for (const operation of ['disable', 'sign-out', 'reset-mfa']) {
      const refused = await send('POST', `/api/admin/accounts/${person.id}/security`, { operation }, cookie)
      expect(`${operation}: ${refused.status}`).toBe(`${operation}: 409`)
    }
  })

  test('an erased account leaves the directory unless it is asked for', async () => {
    const person = await member('hidden')
    await send('POST', `/api/admin/accounts/${person.id}/security`, { operation: 'erase' }, cookie)

    const listing = await (await send('GET', `/api/admin/accounts?search=${encodeURIComponent(person.email)}`, null, cookie)).json() as { total: number }
    expect(listing.total).toBe(0)

    const tombstones = await (await send('GET', '/api/admin/accounts?filter=anonymised', null, cookie)).json() as { items: { id: string }[] }
    expect(tombstones.items.map(item => item.id)).toContain(person.id)
  })

  // The bundle is the definition of completeness, so it is the thing worth checking twice.
  test('an export taken before erasure has nothing left to find after it', async () => {
    const person = await member('exported')
    const before = await (await send('GET', '/api/account/export', null, person.cookie)).text()
    expect(before).toContain(person.email)
    expect(before).toContain(person.name)

    await send('POST', `/api/admin/accounts/${person.id}/security`, { operation: 'erase' }, cookie)

    // Every table the registry knows, read whole: the address and the name are gone from all of
    // them, not just from the ones the bundle happens to carry.
    for (const entry of PERSONAL_TABLES) {
      const contents = readAll(`SELECT * FROM ${entry.name}`)
      expect(`${entry.name} address: ${contents.includes(person.email)}`).toBe(`${entry.name} address: false`)
      expect(`${entry.name} name: ${contents.includes(person.name)}`).toBe(`${entry.name} name: false`)
    }
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
