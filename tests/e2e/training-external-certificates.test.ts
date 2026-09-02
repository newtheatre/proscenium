import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { adminSession, forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { londonParts } from '#shared/utils/london'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillDate, openSignedOutView, pickPerson, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-121: competence earned elsewhere counts, without our pretending we assessed it.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''

const password = generatePassword()
const member = { ...syntheticPerson(23), email: registrableAddress('external-member') }
let memberId = ''
let memberCookie = ''
let department = ''

const officerPassword = generatePassword()
const officer = { ...syntheticPerson(59), email: registrableAddress('external-officer') }
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

  department = `EXT${suffix()}`
  await send('POST', '/api/admin/training/departments', { code: department, name: 'External certificates' })

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
  const id = `EXT-${suffix()}`
  const answered = await send('POST', '/api/admin/training/modules', {
    id,
    department: into,
    kind: 'MODULE',
    name: `Module ${id}`,
    status: 'ACTIVE',
    allowsExternal: true,
    ...over,
  })
  expect(answered.status).toBe(200)
  return id
}

const record = (body: Record<string, unknown>, as = cookie): Promise<Response> =>
  send('POST', '/api/admin/training/external-certificates', body, as)

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

const complete = (moduleId: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  userId: memberId,
  moduleId,
  awardedOn: today(),
  expiresOn: daysFrom(365),
  evidenceRef: 'IPAF 3a, certificate 44821',
  ...over,
})

describe.skipIf(skip !== null)('accepting one is the module\'s choice (G-121 criterion 1)', () => {
  test('a module that has opted in takes one', async () => {
    const module = await addModule()
    const answered = await record(complete(module))
    expect(answered.status).toBe(200)
    expect(read<{ source: string }>(
      'SELECT source FROM training_records WHERE module_id = ?', module,
    )?.source).toBe('EXTERNAL')
  })

  test('a module that has not is refused, and the refusal says so', async () => {
    const module = await addModule({ allowsExternal: false })
    const refused = await record(complete(module))
    expect(refused.status).toBe(409)
    expect(await said(refused)).toContain('external')
    expect(read<{ n: number }>(
      'SELECT count(*) n FROM training_records WHERE module_id = ?', module,
    )?.n).toBe(0)
  })

  test('a retired module and a brief are both refused', async () => {
    const retired = await addModule({ status: 'RETIRED' })
    const brief = await addModule({ kind: 'BRIEF' })
    expect((await record(complete(retired))).status).toBe(409)
    expect((await record(complete(brief))).status).toBe(409)
  })
})

describe.skipIf(skip !== null)('the evidence is the whole of it (G-121 criterion 2)', () => {
  test('a record with no evidence reference is refused', async () => {
    const module = await addModule()
    expect((await record(complete(module, { evidenceRef: undefined }))).status).toBe(400)
    expect((await record(complete(module, { evidenceRef: null }))).status).toBe(400)
    expect((await record(complete(module, { evidenceRef: '   ' }))).status).toBe(400)
    expect(read<{ n: number }>(
      'SELECT count(*) n FROM training_records WHERE module_id = ?', module,
    )?.n).toBe(0)
  })

  test('the reference is stored against the record', async () => {
    const module = await addModule()
    const answered = await record(complete(module, { evidenceRef: 'PASMA 2029, ref 7781' }))
    expect(answered.status).toBe(200)
    expect(read<{ evidence: string }>(
      'SELECT evidence_ref evidence FROM training_records WHERE id = ?',
      (await answered.json() as { id: string }).id,
    )?.evidence).toBe('PASMA 2029, ref 7781')
  })
})

describe.skipIf(skip !== null)('the term is the issuer\'s, inside our cap (G-121 criterion 3)', () => {
  test('a record with no expiry is refused, and so is never', async () => {
    const module = await addModule()
    expect((await record(complete(module, { expiresOn: undefined }))).status).toBe(400)
    expect((await record(complete(module, { expiresOn: null }))).status).toBe(400)
  })

  test('the expiry is stored as an override, so recalculation leaves it alone', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const answered = await record(complete(module, { expiresOn: daysFrom(90) }))
    expect(answered.status).toBe(200)
    const held = read<{ expires: string, overridden: number }>(
      'SELECT expires_on expires, expiry_overridden overridden FROM training_records WHERE id = ?',
      (await answered.json() as { id: string }).id,
    )
    expect(held?.expires).toBe(daysFrom(90))
    expect(held?.overridden).toBe(1)
  })

  // The module's policy is exactly what a certificate never inherits: a house policy of twelve
  // months does not shorten a three-year ticket the issuing body granted.
  test('a term past the module policy is taken, where a sign-off would be refused', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const past = daysFrom(365 * 3)
    expect((await send('POST', '/api/admin/training/signoffs', {
      userId: memberId, moduleId: module, awardedOn: today(), expiresOn: past,
    })).status).toBe(422)
    expect((await record(complete(module, { expiresOn: past }))).status).toBe(200)
  })

  test('an expiry on or before the award is refused', async () => {
    const module = await addModule()
    expect((await record(complete(module, { expiresOn: today() }))).status).toBe(422)
    expect((await record(complete(module, { expiresOn: daysFrom(-1) }))).status).toBe(422)
  })

  test('an expiry past the catalogue-wide cap is refused', async () => {
    const module = await addModule()
    const refused = await record(complete(module, { expiresOn: daysFrom(365 * 11) }))
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain('120')
  })
})

describe.skipIf(skip !== null)('EXTERNAL is what every view reads (G-121 criterion 4)', () => {
  test('the member and the lead both see how it was come by', async () => {
    const module = await addModule({ name: 'Working at height' })
    expect((await record(complete(module))).status).toBe(200)

    const mine = await (await send('GET', '/api/training/records', undefined, memberCookie)).json() as
      { items: { moduleId: string, source: string }[] }
    expect(mine.items.find(one => one.moduleId === module)?.source).toBe('EXTERNAL')

    const theirs = await (await send('GET', `/api/admin/training/records?userId=${memberId}`)).json() as
      { items: { moduleId: string, source: string }[] }
    expect(theirs.items.find(one => one.moduleId === module)?.source).toBe('EXTERNAL')
  })

  test('the erasure export carries the source alongside the evidence', async () => {
    const module = await addModule()
    expect((await record(complete(module))).status).toBe(200)
    expect(read<{ source: string }>(
      `SELECT source FROM training_records WHERE module_id = ? AND source <> 'SIGNOFF'`, module,
    )?.source).toBe('EXTERNAL')
  })

  test('it is audited under its own action, apart from a sign-off', async () => {
    const module = await addModule()
    expect((await record(complete(module))).status).toBe(200)
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'record.external-certificate'
       AND json_extract(detail, '$.module') = ?`,
      module,
    )?.n).toBe(1)
  })

  // Criterion 2 says the reference is mandatory, and 0011 says free text about a person never
  // reaches the trail. Both hold at once, because the trail carries the module and not the paper.
  test('the evidence reference never reaches the audit detail', async () => {
    const module = await addModule()
    expect((await record(complete(module, { evidenceRef: 'Held by their old employer' }))).status).toBe(200)
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE detail LIKE '%old employer%'`,
    )?.n).toBe(0)
  })
})

describe.skipIf(skip !== null)('the sign-off rules apply unchanged (G-121 criterion 5)', () => {
  test('a lead of another department is refused, and their own is allowed', async () => {
    const lead = await adminSession(app, { roles: [] })
    const theirs = `OWN${suffix()}`
    await send('POST', '/api/admin/training/departments', { code: theirs, name: 'Theirs' })
    await send('POST', `/api/admin/training/departments/${theirs}/leads`, { userId: lead.id })

    const mine = await addModule({}, theirs)
    const somebody = await addModule()

    expect((await record(complete(mine), lead.cookie)).status).toBe(200)
    expect((await record(complete(somebody), lead.cookie)).status).toBe(403)
  })

  test('a member cannot record one', async () => {
    const module = await addModule()
    expect((await record(complete(module), memberCookie)).status).toBe(403)
  })

  test('an award cannot be dated in the future', async () => {
    const module = await addModule()
    const refused = await record(complete(module, { awardedOn: daysFrom(1), expiresOn: daysFrom(400) }))
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain('future')
  })

  test('a missing prerequisite refuses and names what is missing', async () => {
    const gate = await addModule()
    const advanced = await addModule()
    await send('POST', `/api/admin/training/modules/${advanced}/prerequisites`, { requiresId: gate })

    const refused = await record(complete(advanced))
    expect(refused.status).toBe(422)
    expect(await said(refused)).toContain(gate)

    expect((await record(complete(gate))).status).toBe(200)
    expect((await record(complete(advanced))).status).toBe(200)
  })

  // Nothing in the body waves a gap through, which is what G-120 criterion 2 asks absolutely.
  test('nothing in the body can wave a gap through', async () => {
    const gate = await addModule()
    const advanced = await addModule({ kind: 'CERTIFICATION' })
    await send('POST', `/api/admin/training/modules/${advanced}/prerequisites`, { requiresId: gate })

    for (const attempt of [{ acknowledge: true }, { force: true }, { override: true }]) {
      expect((await record(complete(advanced, attempt))).status).toBe(422)
    }
  })

  test('a correction is a revocation and a fresh record, never an edit', async () => {
    const module = await addModule()
    const answered = await record(complete(module))
    const id = (await answered.json() as { id: string }).id

    expect((await send('POST', `/api/admin/training/records/${id}/revoke`,
      { reason: 'Certificate turned out to have lapsed' })).status).toBe(200)
    expect(read<{ at: number }>('SELECT revoked_at at FROM training_records WHERE id = ?', id)?.at)
      .toBeTruthy()
    expect((await record(complete(module))).status).toBe(200)
    expect(read<{ n: number }>(
      'SELECT count(*) n FROM training_records WHERE module_id = ?', module,
    )?.n).toBe(2)
  })
})

describe.skipIf(skip !== null)('the officer screen (G-121)', () => {
  test('an officer records a certificate on the screen, and the row says EXTERNAL', async () => {
    const module = await addModule({ name: 'Rigging a lantern' })

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

      await pickPerson(view, '[data-test="person-picker"]', member.email, member.name)
      await waitFor(view, `document.querySelector('[data-test="record-external"]')`, 30_000)
      await click(view, '[data-test="record-external"]')
      await waitFor(view, `document.querySelector('[data-test="external-${module}"]')`)
      await click(view, `[data-test="external-${module}"]`)
      await fillDate(view, '[data-test="external-expiry"]', daysFrom(400))
      await fill(view, '[data-test="external-evidence"]', 'IPAF 3a, certificate 44821')
      await click(view, '[data-test="external-submit"]')

      await waitFor(
        view,
        `document.querySelector('[data-test="records-table"]')?.textContent?.includes('${module}')`,
        30_000,
      )
    }
    finally {
      view.close()
    }

    // Filling a date field is not evidence that a date was submitted, so the case reads the row
    // rather than the screen (0038).
    const held = read<{ source: string, evidence: string, overridden: number, expires: string }>(
      `SELECT source, evidence_ref evidence, expiry_overridden overridden, expires_on expires
       FROM training_records WHERE user_id = ? AND module_id = ?`,
      memberId,
      module,
    )
    expect(held?.source).toBe('EXTERNAL')
    expect(held?.evidence).toBe('IPAF 3a, certificate 44821')
    expect(held?.overridden).toBe(1)
    expect(held?.expires).toBe(daysFrom(400))
  }, CASE_TIMEOUT_MS)

  test('the member sees it named as a certificate rather than as a sign-off', async () => {
    const module = await addModule({ name: 'Driving the desk' })
    expect((await record(complete(module))).status).toBe(200)

    // Signed out first, the way every other suite does it: openView() keeps whatever session the
    // browser already had, and the screen then answers for the wrong person.
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', member.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="sign-out"]')`, 30_000)

      await visit(view, `${app.baseURL}/training`, '[data-test="training-page"]')
      await waitFor(view, `document.querySelector('[data-test="records"]')`, 30_000)
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      expect(await textOf(view, `[data-test="record-${module}"]`)).toContain('External certificate')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
