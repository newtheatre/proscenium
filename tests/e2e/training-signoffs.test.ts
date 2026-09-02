import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { adminSession, forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { londonParts } from '#shared/utils/london'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, openView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-120 and G-122: the first thing that awards a record, and the only thing that takes one away.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''

const password = generatePassword()
const member = { ...syntheticPerson(11), email: registrableAddress('signoff-member') }
let memberId = ''
let memberCookie = ''
let department = ''

const officerPassword = generatePassword()
const officer = { ...syntheticPerson(97), email: registrableAddress('signoff-officer') }
let officerSecret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: member.email, name: member.name, password }, '')
  markVerified(app, member.email)
  memberId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', member.email)!.id
  const signedIn = await send('POST', '/api/auth/sign-in', { email: member.email, password }, '')
  memberCookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

  department = `SGN${suffix()}`
  await send('POST', '/api/admin/training/departments', { code: department, name: 'Sign-offs' })

  // An officer the browser can sign in as: the screen is admin-only, so the case needs a real
  // privileged session rather than a cookie handed round the side (A-112).
  await send('POST', '/api/auth/register', { email: officer.email, name: officer.name, password: officerPassword }, '')
  markVerified(app, officer.email)
  const first = await send('POST', '/api/auth/sign-in', { email: officer.email, password: officerPassword }, '')
  const firstCookie = (first.headers.get('set-cookie') ?? '').split(';')[0]!
  officerSecret = (await (await send('POST', '/api/account/mfa/enrol', {}, firstCookie)).json() as { secret: string }).secret
  await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(officerSecret, stepFor(new Date())) }, firstCookie)
  // --additional because adminSession has already bootstrapped one, and the script refuses a
  // second bootstrap into a database that already has a way in.
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

// London days, because that is what an award date is (0014). Adding to a UTC instant is not the
// same thing: at 23:30 BST, "tomorrow in UTC" is already today in London.
function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
}

const today = (): string => daysFrom(0)

async function addModule(over: Record<string, unknown> = {}, into = department): Promise<string> {
  const id = `SGN-${suffix()}`
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

const signOff = (body: Record<string, unknown>, as = cookie): Promise<Response> =>
  send('POST', '/api/admin/training/signoffs', body, as)

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

describe.skipIf(skip !== null)('a lead signs off their own department (G-120)', () => {
  test('a sign-off awards one record, stamped from the module policy', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 24 })
    const answered = await signOff({ userId: memberId, moduleId: module, awardedOn: today() })
    expect(answered.status).toBe(200)

    const held = read<{ source: string, expires: string, overridden: number }>(
      'SELECT source, expires_on expires, expiry_overridden overridden FROM training_records WHERE module_id = ?',
      module,
    )
    expect(held?.source).toBe('SIGNOFF')
    expect(held?.overridden).toBe(0)
    expect(held?.expires).toBeTruthy()
  })

  test('a lead of another department is refused, and their own is allowed (criterion 1)', async () => {
    const lead = await adminSession(app, { roles: [] })
    const theirs = `OWN${suffix()}`
    await send('POST', '/api/admin/training/departments', { code: theirs, name: 'Theirs' })
    await send('POST', `/api/admin/training/departments/${theirs}/leads`, { userId: lead.id })

    const mine = await addModule({}, theirs)
    const somebody = await addModule()

    expect((await signOff({ userId: memberId, moduleId: mine, awardedOn: today() }, lead.cookie)).status).toBe(200)
    expect((await signOff({ userId: memberId, moduleId: somebody, awardedOn: today() }, lead.cookie)).status).toBe(403)
  })

  test('a member cannot sign anything off', async () => {
    const module = await addModule()
    expect((await signOff({ userId: memberId, moduleId: module, awardedOn: today() }, memberCookie)).status)
      .toBe(403)
  })

  test('an award cannot be dated in the future (criterion 3)', async () => {
    const module = await addModule()
    const refused = await signOff({ userId: memberId, moduleId: module, awardedOn: daysFrom(1) })
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain('future')
  })

  test('a retired module and a brief both refuse a sign-off', async () => {
    const retired = await addModule({ status: 'RETIRED' })
    const brief = await addModule({ kind: 'BRIEF' })
    expect((await signOff({ userId: memberId, moduleId: retired, awardedOn: today() })).status).toBe(409)
    expect((await signOff({ userId: memberId, moduleId: brief, awardedOn: today() })).status).toBe(409)
  })
})

describe.skipIf(skip !== null)('a gap is named and never waved through (G-120 criterion 2)', () => {
  test('a missing prerequisite refuses and names what is missing', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    await send('POST', `/api/admin/training/modules/${advanced}/prerequisites`, { requiresId: gate })

    const refused = await signOff({ userId: memberId, moduleId: advanced, awardedOn: today() })
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain(gate)
  })

  test('holding the prerequisite opens it', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    await send('POST', `/api/admin/training/modules/${advanced}/prerequisites`, { requiresId: gate })

    expect((await signOff({ userId: memberId, moduleId: gate, awardedOn: today() })).status).toBe(200)
    expect((await signOff({ userId: memberId, moduleId: advanced, awardedOn: today() })).status).toBe(200)
  })

  // A certification has no acknowledgement path, and neither does anything else: there is no
  // parameter that waves a gap through, which is what the criterion asks for absolutely.
  test('nothing in the body can wave a gap through', async () => {
    const gate = await addModule()
    const advanced = await addModule({ kind: 'CERTIFICATION' })
    await send('POST', `/api/admin/training/modules/${advanced}/prerequisites`, { requiresId: gate })

    for (const attempt of [{ acknowledge: true }, { force: true }, { override: true }]) {
      const refused = await signOff({ userId: memberId, moduleId: advanced, awardedOn: today(), ...attempt })
      expect(refused.status).toBe(422)
    }
  })

  test('an expiring prerequisite counts as held and an expired one does not', async () => {
    const gate = await addModule({ expiryMode: 'MONTHS', expiryMonths: 1 })
    const advanced = await addModule()
    await send('POST', `/api/admin/training/modules/${advanced}/prerequisites`, { requiresId: gate })

    // Awarded today with a one-month policy, so it sits inside the warning window and still counts.
    expect((await signOff({ userId: memberId, moduleId: gate, awardedOn: today() })).status).toBe(200)
    expect((await signOff({ userId: memberId, moduleId: advanced, awardedOn: today() })).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('an explicit expiry has to fit (G-120 criteria 4 and 5)', () => {
  test('an expiry on or before the award is refused', async () => {
    const module = await addModule()
    const refused = await signOff({
      userId: memberId,
      moduleId: module,
      awardedOn: today(),
      expiresOn: today(),
    })
    expect(refused.status).toBe(422)
  })

  test('an expiry past the module policy is refused, and one inside it is taken', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const past = await signOff({
      userId: memberId,
      moduleId: module,
      awardedOn: today(),
      expiresOn: daysFrom(500),
    })
    expect(past.status).toBe(422)

    const inside = await signOff({
      userId: memberId,
      moduleId: module,
      awardedOn: today(),
      expiresOn: daysFrom(200),
    })
    expect(inside.status).toBe(200)
    expect(read<{ overridden: number }>(
      'SELECT expiry_overridden overridden FROM training_records WHERE id = ?',
      (await inside.json() as { id: string }).id,
    )?.overridden).toBe(1)
  })

  test('an expiry past the catalogue-wide cap is refused even with no module policy', async () => {
    const module = await addModule()
    const refused = await signOff({
      userId: memberId,
      moduleId: module,
      awardedOn: today(),
      expiresOn: daysFrom(365 * 11),
    })
    expect(refused.status).toBe(422)
  })

  // Criterion 5: break-glass, and a lead holding no role cannot reach it.
  test('never expiring needs the administrator permission, and is audited on its own', async () => {
    const lead = await adminSession(app, { roles: [] })
    await send('POST', `/api/admin/training/departments/${department}/leads`, { userId: lead.id })
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })

    const refused = await signOff({
      userId: memberId,
      moduleId: module,
      awardedOn: today(),
      expiresOn: null,
    }, lead.cookie)
    expect(refused.status).toBe(403)

    const allowed = await signOff({
      userId: memberId,
      moduleId: module,
      awardedOn: today(),
      expiresOn: null,
    })
    expect(allowed.status).toBe(200)
    expect(read<{ expires: string | null }>(
      'SELECT expires_on expires FROM training_records WHERE module_id = ?', module,
    )?.expires).toBeNull()
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'record.signoff.unbounded' AND target = ?`,
      `user:${memberId}`,
    )?.n).toBeGreaterThan(0)
  })
})

describe.skipIf(skip !== null)('revocation is the only way back (G-122)', () => {
  async function awarded(): Promise<string> {
    const module = await addModule()
    const answered = await signOff({ userId: memberId, moduleId: module, awardedOn: today() })
    return (await answered.json() as { id: string }).id
  }

  test('a reason is mandatory (criterion 2)', async () => {
    const id = await awarded()
    expect((await send('POST', `/api/admin/training/records/${id}/revoke`, {})).status).toBe(400)
    expect((await send('POST', `/api/admin/training/records/${id}/revoke`, { reason: '  ' })).status).toBe(400)
  })

  test('a lead cannot revoke, and an administrator can (criterion 1)', async () => {
    const lead = await adminSession(app, { roles: [] })
    await send('POST', `/api/admin/training/departments/${department}/leads`, { userId: lead.id })
    const id = await awarded()

    expect((await send('POST', `/api/admin/training/records/${id}/revoke`,
      { reason: 'Not competent' }, lead.cookie)).status).toBe(403)
    expect((await send('POST', `/api/admin/training/records/${id}/revoke`,
      { reason: 'Not competent' })).status).toBe(200)
  })

  // Criterion 3, and the thing a racing test proves rather than a comment promising it.
  test('revoking twice succeeds and leaves one stamp and one entry', async () => {
    const id = await awarded()
    expect((await send('POST', `/api/admin/training/records/${id}/revoke`, { reason: 'First' })).status).toBe(200)
    const first = read<{ at: number }>('SELECT revoked_at at FROM training_records WHERE id = ?', id)?.at

    expect((await send('POST', `/api/admin/training/records/${id}/revoke`, { reason: 'Second' })).status).toBe(200)
    expect(read<{ at: number }>('SELECT revoked_at at FROM training_records WHERE id = ?', id)?.at).toBe(first!)
    expect(read<{ reason: string }>('SELECT revoke_reason reason FROM training_records WHERE id = ?', id)?.reason)
      .toBe('First')
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'record.revoked' AND json_extract(detail, '$.record') = ?`,
      id,
    )?.n).toBe(1)
  })

  test('a revoked record stops counting at the gate it opened (criterion 4)', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    await send('POST', `/api/admin/training/modules/${advanced}/prerequisites`, { requiresId: gate })

    const held = await signOff({ userId: memberId, moduleId: gate, awardedOn: today() })
    const id = (await held.json() as { id: string }).id
    expect((await signOff({ userId: memberId, moduleId: advanced, awardedOn: today() })).status).toBe(200)

    await send('POST', `/api/admin/training/records/${id}/revoke`, { reason: 'Recorded in error' })
    const second = await addModule()
    await send('POST', `/api/admin/training/modules/${second}/prerequisites`, { requiresId: gate })
    expect((await signOff({ userId: memberId, moduleId: second, awardedOn: today() })).status).toBe(422)
  })

  test('the record survives, and the reason never reaches the trail (criteria 5 and 6)', async () => {
    const id = await awarded()
    await send('POST', `/api/admin/training/records/${id}/revoke`, { reason: 'A private matter about them' })

    expect(read<{ awarded: string }>('SELECT awarded_on awarded FROM training_records WHERE id = ?', id)?.awarded)
      .toBeTruthy()
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE detail LIKE '%private matter%'`,
    )?.n).toBe(0)
  })
})

describe.skipIf(skip !== null)('the journey, end to end', () => {
  test('signed off, seen by the member, revoked, and gone from their view', async () => {
    const module = await addModule({ name: 'Driving the desk' })
    const answered = await signOff({ userId: memberId, moduleId: module, awardedOn: today() })
    const id = (await answered.json() as { id: string }).id

    const view = await openView()
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', member.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="sign-out"]')`, 30_000)

      await visit(view, `${app.baseURL}/training`, '[data-test="training-page"]')
      await waitFor(view, `document.querySelector('[data-test="records"]')`, 30_000)
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      expect(await textOf(view, '[data-test="records"]')).toContain(module)

      await send('POST', `/api/admin/training/records/${id}/revoke`, { reason: 'Recorded in error' })

      await visit(view, `${app.baseURL}/training`, '[data-test="training-page"]')
      expect(await textOf(view, 'body')).not.toContain(module)
    }
    finally {
      view.close()
    }

    // Gone from the member's view, still there for a lead: revoked history stays readable.
    const history = await (await send('GET', `/api/admin/training/records?userId=${memberId}`)).json() as
      { items: { id: string, revokedAt: number | null }[] }
    expect(history.items.find(one => one.id === id)?.revokedAt).toBeTruthy()
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the officer screen (G-120, G-122)', () => {
  test('the records screen renders and hydrates for an officer', async () => {
    const member = await adminSession(app, { roles: [] })
    await signOff({ userId: member.id, moduleId: await addModule({ name: 'Rigging a lantern' }), awardedOn: today() })

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
      await waitFor(view, `document.querySelector('[data-test="sign-out"]')`, 30_000)

      await visit(view, `${app.baseURL}/admin/training-records`, '[data-test="person-picker"]')
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      expect(await textOf(view, 'body')).toContain('Whose records')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
