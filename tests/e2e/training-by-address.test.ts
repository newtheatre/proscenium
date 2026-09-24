import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { adminSession, forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { londonParts } from '#shared/utils/london'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, pickPerson, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-130 and 0091: a sign-off or a certificate for somebody the picker could not find.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''
let department = ''

const member = { ...syntheticPerson(12), email: registrableAddress('address-member') }
const officerPassword = generatePassword()
const officer = { ...syntheticPerson(96), email: registrableAddress('address-officer') }
let officerSecret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: member.email, name: member.name, password: generatePassword() }, '')
  markVerified(app, member.email)

  department = `ADR${suffix()}`
  await send('POST', '/api/admin/training/departments', { code: department, name: 'By address' })

  await send('POST', '/api/auth/register', { email: officer.email, name: officer.name, password: officerPassword }, '')
  markVerified(app, officer.email)
  const first = await send('POST', '/api/auth/sign-in', { email: officer.email, password: officerPassword }, '')
  const firstCookie = (first.headers.get('set-cookie') ?? '').split(';')[0]!
  officerSecret = (await (await send('POST', '/api/account/mfa/enrol', {}, firstCookie)).json() as { secret: string }).secret
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(officerSecret, stepFor(new Date())) }, firstCookie)
  expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', officer.email, app.databaseFile, '--additional'])
    .exitCode).toBe(0)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

const send = (method: string, path: string, body?: unknown, as = cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

const suffix = (): string => crypto.randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')

function today(): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day)).toISOString().slice(0, 10)
}

function yearsOn(years: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year + years, now.month - 1, now.day)).toISOString().slice(0, 10)
}

async function addModule(over: Record<string, unknown> = {}, into = department): Promise<string> {
  const id = `ADR-${suffix()}`
  const answered = await send('POST', '/api/admin/training/modules', {
    id,
    department: into,
    kind: 'MODULE',
    name: `Module ${id}`,
    status: 'ACTIVE',
    ...over,
  })
  expect(answered.status).toBe(200)
  return id
}

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

const newcomer = (prefix: string): { email: string, name: string } =>
  ({ email: registrableAddress(prefix), name: 'Fresh Fresher' })

describe.skipIf(skip !== null)('a sign-off by address (G-130 criteria 2 and 3)', () => {
  test('makes one account with no way in and one record on it, and sends nothing', async () => {
    const module = await addModule()
    const person = newcomer('signoff-new')
    const answered = await send('POST', '/api/admin/training/signoffs', { ...person, moduleId: module, awardedOn: today() })
    expect(answered.status).toBe(200)
    const { userId } = await answered.json() as { userId: string }

    const account = read<{ id: string, password: string | null, google: string | null }>(
      'SELECT id, password, google_sub google FROM users WHERE email = ?', person.email,
    )
    expect(account).toEqual({ id: userId, password: null, google: null })
    expect(read<{ source: string }>('SELECT source FROM training_records WHERE user_id = ?', userId)?.source).toBe('SIGNOFF')
    expect(read<{ n: number }>(`SELECT count(*) n FROM audit_log WHERE action = 'account.created.console' AND target = ?`, `user:${userId}`)?.n).toBe(1)
    // Criterion 5: a record gives nobody access that is waiting on them.
    expect(read<{ n: number }>('SELECT count(*) n FROM notification_log WHERE user_id = ?', userId)?.n).toBe(0)
    // Criterion 6.
    expect(read<{ n: number }>(`SELECT count(*) n FROM audit_log WHERE detail LIKE ? OR detail LIKE '%Fresh Fresher%'`, `%${person.email}%`)?.n).toBe(0)
  })

  test('an address with an account is refused, pointing at the search (criterion 1)', async () => {
    const module = await addModule()
    const refused = await send('POST', '/api/admin/training/signoffs', { email: member.email, name: 'Anyone', moduleId: module, awardedOn: today() })
    expect(refused.status).toBe(409)
    expect(await said(refused)).toContain('search')
    expect(read<{ n: number }>('SELECT count(*) n FROM training_records WHERE module_id = ?', module)?.n).toBe(0)
  })

  test('a second record for the same newcomer is made by choosing them', async () => {
    const person = newcomer('signoff-twice')
    const first = await send('POST', '/api/admin/training/signoffs', { ...person, moduleId: await addModule(), awardedOn: today() })
    expect(first.status).toBe(200)
    const again = await send('POST', '/api/admin/training/signoffs', { ...person, moduleId: await addModule(), awardedOn: today() })
    expect(again.status).toBe(409)
    const { userId } = await first.json() as { userId: string }
    expect((await send('POST', '/api/admin/training/signoffs', { userId, moduleId: await addModule(), awardedOn: today() })).status).toBe(200)
  })

  test('every sign-off rule still applies: a prerequisite a new account cannot hold is named', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    await send('POST', `/api/admin/training/modules/${advanced}/prerequisites`, { requiresId: gate })
    const person = newcomer('signoff-gap')
    const refused = await send('POST', '/api/admin/training/signoffs', { ...person, moduleId: advanced, awardedOn: today() })
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain(gate)
    expect(read('SELECT id FROM users WHERE email = ?', person.email)).toBeUndefined()
  })

  test('an address with an account is sent to the search before any prerequisite is weighed', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    await send('POST', `/api/admin/training/modules/${advanced}/prerequisites`, { requiresId: gate })
    const refused = await send('POST', '/api/admin/training/signoffs', { email: member.email, name: 'Anyone', moduleId: advanced, awardedOn: today() })
    expect(refused.status).toBe(409)
    expect(await said(refused)).toContain('search')
  })
})

describe.skipIf(skip !== null)('an external certificate by address (G-130 criterion 2)', () => {
  test('lands as EXTERNAL on a new account, with its evidence', async () => {
    const module = await addModule({ allowsExternal: true })
    const person = newcomer('external-new')
    const answered = await send('POST', '/api/admin/training/external-certificates', {
      ...person,
      moduleId: module,
      awardedOn: today(),
      expiresOn: yearsOn(3),
      evidenceRef: 'First aid at work, certificate 1234',
    })
    expect(answered.status).toBe(200)
    const { userId } = await answered.json() as { userId: string }
    expect(read<{ source: string, evidence: string }>(
      'SELECT source, evidence_ref evidence FROM training_records WHERE user_id = ?', userId,
    )).toEqual({ source: 'EXTERNAL', evidence: 'First aid at work, certificate 1234' })
  })
})

describe.skipIf(skip !== null)('who may make the account (criterion 4)', () => {
  test('a lead may in their own department and not in another', async () => {
    const lead = await adminSession(app, { roles: [] })
    const theirs = `ADL${suffix()}`
    await send('POST', '/api/admin/training/departments', { code: theirs, name: 'Theirs' })
    await send('POST', `/api/admin/training/departments/${theirs}/leads`, { userId: lead.id })

    const mine = await addModule({}, theirs)
    const other = await addModule()
    expect((await send('POST', '/api/admin/training/signoffs', { ...newcomer('lead-own'), moduleId: mine, awardedOn: today() }, lead.cookie)).status).toBe(200)
    const refused = newcomer('lead-other')
    expect((await send('POST', '/api/admin/training/signoffs', { ...refused, moduleId: other, awardedOn: today() }, lead.cookie)).status).toBe(403)
    expect(read('SELECT id FROM users WHERE email = ?', refused.email)).toBeUndefined()
  })

  test('a member with no standing is refused before anything is read', async () => {
    const stranger = await adminSession(app, { roles: [] })
    const answered = await send('POST', '/api/admin/training/signoffs', { ...newcomer('stranger'), moduleId: await addModule(), awardedOn: today() }, stranger.cookie)
    expect(answered.status).toBe(403)
  })
})

describe.skipIf(skip !== null)('a lead finds people with no accounts.read (G-130 criterion 1)', () => {
  const search = (term: string, as: string): Promise<Response> =>
    send('GET', `/api/admin/training/people?search=${encodeURIComponent(term)}`, undefined, as)

  test('by address or name, answered with an id and a name and nothing more', async () => {
    const lead = await adminSession(app, { roles: [] })
    const theirs = `ADS${suffix()}`
    await send('POST', '/api/admin/training/departments', { code: theirs, name: 'Searchers' })
    await send('POST', `/api/admin/training/departments/${theirs}/leads`, { userId: lead.id })
    expect((await send('GET', `/api/admin/accounts?search=${encodeURIComponent(member.email)}`, undefined, lead.cookie)).status).toBe(403)

    for (const term of [member.email, member.name]) {
      const found = await search(term, lead.cookie)
      expect(found.status).toBe(200)
      const { items } = await found.json() as { items: Record<string, unknown>[] }
      expect(items.map(item => item.name)).toContain(member.name)
      expect(items.every(item => Object.keys(item).sort().join(',') === 'id,name')).toBe(true)
    }
  })

  test('somebody with no training standing is refused', async () => {
    const stranger = await adminSession(app, { roles: [] })
    expect((await search(member.name, stranger.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the records screen (G-130 criteria 1 and 7)', () => {
  test('offers the address only once the search has found nobody', async () => {
    const person = newcomer('screen-new')
    forgetSpentStep(app, officer.email)
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', officer.email)
      await fill(view, 'form input[type="password"]', officerPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)
      const code = await codeForStep(officerSecret, stepFor(new Date()) + 1)
      for (const [index, digit] of [...code].entries()) {
        await fill(view, `[data-test="mfa-challenge"] input:nth-of-type(${index + 1})`, digit)
      }
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)

      await visit(view, `${app.baseURL}/training/manage/records`, '[data-test="person-picker"]')
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="records-nobody-found"]'))`)).toBe(false)

      // Somebody chosen first must not stay on screen behind the address, or an award meant for
      // the page they are looking at would go to the address instead.
      await pickPerson(view, '[data-test="person-picker"]', member.email, member.name)
      await waitFor(view, `document.querySelector('[data-test="sign-off"]')`, 30_000)

      await click(view, '[data-test="person-picker"] input')
      await fill(view, '[data-test="person-picker"] input', person.email)
      await waitFor(view, `document.querySelector('[data-test="records-nobody-found"]')`, 20_000)
      await click(view, '[data-test="records-nobody-found"]')
      await waitFor(view, `document.querySelector('[data-test="records-by-address"]')`)
      expect(await view.evaluate<number>(`document.querySelectorAll('[data-test="sign-off"]').length`)).toBe(1)
      await fill(view, '[data-test="records-email"] input', person.email)
      await fill(view, '[data-test="records-name"] input', person.name)
      await waitFor(view, `!document.querySelector('[data-test="sign-off"]')?.disabled`)
      expect(await textOf(view, '[data-test="records-by-address"]')).toContain('Nothing is sent')

      await click(view, '[data-test="records-search-again"]')
      await waitFor(view, `document.querySelector('[data-test="person-picker"]')`)
      expect(await view.evaluate<boolean>(`Boolean(document.querySelector('[data-test="records-by-address"]'))`)).toBe(false)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
