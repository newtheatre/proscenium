import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { londonParts } from '#shared/utils/london'
import { adminSession, forgetSpentStep, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import {
  click,
  fill,
  fillNumber,
  openSignedOutView,
  skipReason,
  startApp,
  textOf,
  visit,
  waitFor,
} from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-124 through the real routes and the real screen. The tool is the only retroactive path to a
// stamped expiry, and the count is what decides whether a run happens at all.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''
let department = ''

const officerPassword = generatePassword()
const officer = { ...syntheticPerson(41), email: registrableAddress('recalc-officer') }
let officerSecret = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  department = `RCL${suffix()}`
  await send('POST', '/api/admin/training/departments', { code: department, name: 'Recalculation' })

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

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
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

// London days, because that is what an award date is (0014).
function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
}

async function addModule(over: Record<string, unknown> = {}): Promise<string> {
  const id = `RCL-${suffix()}`
  const answered = await send('POST', '/api/admin/training/modules', {
    id,
    department,
    kind: 'MODULE',
    name: `Module ${id}`,
    status: 'ACTIVE',
    ...over,
  })
  expect(answered.status).toBe(200)
  return id
}

// Records are seeded directly: what a policy change leaves behind is the point, and reaching that
// state through the award paths would mean changing the policy under them anyway.
function awardTo(userId: string, moduleId: string, columns: Record<string, unknown> = {}): string {
  const id = `rc-${crypto.randomUUID().slice(0, 8)}`
  const values: Record<string, unknown> = {
    id,
    user_id: userId,
    module_id: moduleId,
    awarded_on: '2026-01-15',
    source: 'SIGNOFF',
    ...columns,
  }
  const names = Object.keys(values)
  write(
    `INSERT INTO training_records (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    ...Object.values(values),
  )
  return id
}

interface PreviewBody {
  total: number
  describes: string
  items: { id: string, name: string, awardedOn: string, expiresOn: string | null, becomes: string | null }[]
}

const preview = async (moduleId: string, as = cookie): Promise<Response> =>
  send('GET', `/api/admin/training/recalculations/preview?moduleId=${moduleId}`, undefined, as)

const runIt = (moduleId: string, expectedCount: number, as = cookie): Promise<Response> =>
  send('POST', '/api/admin/training/recalculations', { moduleId, expectedCount }, as)

const expiryOf = (id: string): string | null =>
  read<{ expires: string | null }>('SELECT expires_on expires FROM training_records WHERE id = ?', id)?.expires ?? null

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

describe.skipIf(skip !== null)('the preview comes before anything is written (criterion 2)', () => {
  test('it names the person, the module, the old date and the new one', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const member = await adminSession(app, { roles: [] })
    const id = awardTo(member.id, module, { awarded_on: '2026-01-15', expires_on: '2026-06-01' })

    const answered = await preview(module)
    expect(answered.status).toBe(200)
    const body = await answered.json() as PreviewBody
    expect(body.total).toBe(1)
    expect(body.describes).toContain('12 months')
    expect(body.items[0]).toMatchObject({
      id,
      name: member.name,
      awardedOn: '2026-01-15',
      expiresOn: '2026-06-01',
      becomes: '2027-01-15',
    })

    // A preview writes nothing: the stamped date is exactly where it was.
    expect(expiryOf(id)).toBe('2026-06-01')
  })

  test('a module whose records all match its policy previews as nothing to do', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const member = await adminSession(app, { roles: [] })
    awardTo(member.id, module, { awarded_on: '2026-01-15', expires_on: '2027-01-15' })

    expect((await (await preview(module)).json() as PreviewBody).total).toBe(0)
  })

  test('an unknown module is a 404, and a member may not preview at all', async () => {
    const member = await adminSession(app, { roles: [] })
    expect((await preview('RCL-NOPE')).status).toBe(404)
    expect((await preview(await addModule(), member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the count decides the run (criterion 3)', () => {
  test('the echoed count restates every affected record and writes one entry', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const one = await adminSession(app, { roles: [] })
    const two = await adminSession(app, { roles: [] })
    const first = awardTo(one.id, module, { awarded_on: '2026-01-15' })
    const second = awardTo(two.id, module, { awarded_on: '2026-02-20' })

    const answered = await runIt(module, 2)
    expect(answered.status).toBe(200)
    expect(expiryOf(first)).toBe('2027-01-15')
    expect(expiryOf(second)).toBe('2027-02-20')

    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'record.expiry.recalculated' AND target = ?`,
      `module:${module}`,
    )?.n).toBe(1)
  })

  test('a mismatched count aborts and quotes both figures', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const member = await adminSession(app, { roles: [] })
    const id = awardTo(member.id, module, { awarded_on: '2026-01-15' })

    const refused = await runIt(module, 7)
    expect(refused.status).toBe(409)
    const message = await said(refused)
    expect(message).toContain('7')
    expect(message).toContain('1')

    expect(expiryOf(id)).toBeNull()
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'record.expiry.recalculated' AND target = ?`,
      `module:${module}`,
    )?.n).toBe(0)
  })

  // The race the story is about: the affected set moves between the preview and the confirmation.
  test('a record awarded after the preview aborts the run the preview was for', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const one = await adminSession(app, { roles: [] })
    const two = await adminSession(app, { roles: [] })
    const first = awardTo(one.id, module, { awarded_on: '2026-01-15' })

    expect((await (await preview(module)).json() as PreviewBody).total).toBe(1)
    const second = awardTo(two.id, module, { awarded_on: '2026-03-01' })

    expect((await runIt(module, 1)).status).toBe(409)
    expect(expiryOf(first)).toBeNull()
    expect(expiryOf(second)).toBeNull()

    // Previewed again, the count is right and the same run goes through.
    expect((await (await preview(module)).json() as PreviewBody).total).toBe(2)
    expect((await runIt(module, 2)).status).toBe(200)
    expect(expiryOf(first)).toBe('2027-01-15')
  })

  test('running the same recalculation twice restates nothing the second time', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const member = await adminSession(app, { roles: [] })
    awardTo(member.id, module, { awarded_on: '2026-01-15' })

    expect((await runIt(module, 1)).status).toBe(200)
    expect((await runIt(module, 1)).status).toBe(409)
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'record.expiry.recalculated' AND target = ?`,
      `module:${module}`,
    )?.n).toBe(1)
  })

  test('a member cannot run one', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const member = await adminSession(app, { roles: [] })
    awardTo(member.id, module, { awarded_on: '2026-01-15' })
    expect((await runIt(module, 1, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('what a run always skips (criterion 4)', () => {
  test('overridden, revoked and superseded records keep the dates they had', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const overridden = await adminSession(app, { roles: [] })
    const revoked = await adminSession(app, { roles: [] })
    const renewed = await adminSession(app, { roles: [] })
    const plain = await adminSession(app, { roles: [] })

    const kept = awardTo(overridden.id, module, { expires_on: '2030-01-01', expiry_overridden: 1 })
    const gone = awardTo(revoked.id, module, { expires_on: '2030-01-01' })
    write(
      `UPDATE training_records SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ?`,
      Math.floor(Date.now() / 1000), revoked.id, 'Recorded in error', gone,
    )
    const older = awardTo(renewed.id, module, { awarded_on: '2025-01-15', expires_on: '2030-01-01' })
    const newer = awardTo(renewed.id, module, { awarded_on: '2026-01-15' })
    const ordinary = awardTo(plain.id, module, { awarded_on: '2026-01-15' })

    expect((await (await preview(module)).json() as PreviewBody).total).toBe(2)
    expect((await runIt(module, 2)).status).toBe(200)

    expect(expiryOf(kept)).toBe('2030-01-01')
    expect(expiryOf(gone)).toBe('2030-01-01')
    expect(expiryOf(older)).toBe('2030-01-01')
    expect(expiryOf(newer)).toBe('2027-01-15')
    expect(expiryOf(ordinary)).toBe('2027-01-15')
  })
})

describe.skipIf(skip !== null)('no other write path moves a stamped expiry (criterion 1)', () => {
  test('a policy change leaves every existing record exactly where it was', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const member = await adminSession(app, { roles: [] })
    const id = awardTo(member.id, module, { awarded_on: '2026-01-15', expires_on: '2027-01-15' })

    const changed = await send('PUT', `/api/admin/training/modules/${module}`, {
      department,
      kind: 'MODULE',
      name: `Module ${module}`,
      status: 'ACTIVE',
      expiryMode: 'MONTHS',
      expiryMonths: 24,
    })
    expect(changed.status).toBe(200)
    expect(expiryOf(id)).toBe('2027-01-15')

    // Only the tool moves it, and it says so before it does.
    expect((await (await preview(module)).json() as PreviewBody).items[0]?.becomes).toBe('2028-01-15')
    expect((await runIt(module, 1)).status).toBe(200)
    expect(expiryOf(id)).toBe('2028-01-15')
  })

  test('a fresh sign-off is stamped from the policy and needs no run', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12 })
    const member = await adminSession(app, { roles: [] })
    const answered = await send('POST', '/api/admin/training/signoffs', {
      userId: member.id,
      moduleId: module,
      awardedOn: daysFrom(0),
    })
    expect(answered.status).toBe(200)
    expect((await (await preview(module)).json() as PreviewBody).total).toBe(0)
  })
})

describe.skipIf(skip !== null)('the officer screen', () => {
  test('an officer previews, types the count back and the dates move', async () => {
    const module = await addModule({ expiryMode: 'MONTHS', expiryMonths: 12, name: 'Flying a bar' })
    const member = await adminSession(app, { roles: [] })
    const id = awardTo(member.id, module, { awarded_on: '2026-01-15' })

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

      await visit(view, `${app.baseURL}/admin/training-recalculation`, `[data-test="module-${module}"]`)
      // A server render cannot see a hydration failure, so the page is read after it is live.
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')

      await click(view, `[data-test="module-${module}"]`)
      await waitFor(view, `document.querySelector('[data-test="affected-total"]')`, 30_000)
      expect(await textOf(view, '[data-test="affected-total"]')).toContain('1 record')
      expect(await textOf(view, '[data-test="affected-table"]')).toContain('2027-01-15')

      // The confirmation is the count itself, typed back (criterion 3).
      await fillNumber(view, '[data-test="echoed-count"]', '1')
      await click(view, '[data-test="recalculate"]')
      await waitFor(view, `document.querySelector('[data-test="affected-table"]')`, 30_000)
    }
    finally {
      view.close()
    }

    expect(expiryOf(id)).toBe('2027-01-15')
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
