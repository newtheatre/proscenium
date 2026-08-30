import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { endOfTerm, londonDay } from '#shared/utils/membership'
import { forgetSpentStep, markVerified, registerMember } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(91), email: registrableAddress('secretary') }
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

function read<T>(sql: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(sql).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
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

const today = londonDay(new Date())

const grant = (userId: string, extra: Record<string, unknown> = {}): Promise<Response> =>
  send('POST', '/api/admin/memberships', { userId, startsOn: today, years: 1, ...extra }, cookie)

interface Member { id: string, userId: string, studentId: string | null, expiresOn: string, confirmedAt: number | null }

async function register(query = ''): Promise<{ items: Member[], total: number, graceDays: number }> {
  const response = await send('GET', `/api/admin/memberships${query}`, null, cookie)
  expect(response.status).toBe(200)
  return await response.json() as { items: Member[], total: number, graceDays: number }
}

describe.skipIf(skip !== null)('recording a membership (A-117, 0031)', () => {
  test('a term is recorded, counts immediately, and is not yet checked', async () => {
    const member = await registerMember(app, 'bought', password, { signIn: false })
    const response = await grant(member.id, { years: 3, studentId: '20990001' })
    expect(response.status).toBe(200)
    expect((await response.json() as { expiresOn: string }).expiresOn).toBe(endOfTerm(today, 3))

    // Current from the moment it is recorded: confirmation is a separate act (0031).
    const current = await register(`?search=${encodeURIComponent(member.email)}`)
    expect(current.items).toHaveLength(1)
    expect(current.items[0]!.confirmedAt).toBeNull()

    // Awaiting a check is a filter, not a refusal.
    expect((await register('?filter=awaiting-check')).items.some(row => row.userId === member.id)).toBe(true)
  })

  test('the student number lands on the account and is unique across them', async () => {
    const one = await registerMember(app, 'numbered', password, { signIn: false })
    const two = await registerMember(app, 'clashing', password, { signIn: false })

    expect((await grant(one.id, { studentId: '20990002' })).status).toBe(200)
    expect(read<{ studentId: string }>('SELECT student_id AS studentId FROM users WHERE id = ?', one.id)!.studentId).toBe('20990002')

    const clash = await grant(two.id, { studentId: '20990002' })
    expect(clash.status).toBe(409)
    expect((await clash.json() as { statusMessage: string }).statusMessage).toMatch(/student number/i)
  })

  test('the register finds somebody by their student number rather than their name', async () => {
    const member = await registerMember(app, 'by-number', password, { signIn: false })
    expect((await grant(member.id, { studentId: '20990003' })).status).toBe(200)

    const found = await register('?search=20990003')
    expect(found.items).toHaveLength(1)
    expect(found.items[0]!.userId).toBe(member.id)
  })

  test('confirming records who checked it, once', async () => {
    const member = await registerMember(app, 'checked', password, { signIn: false })
    const { id } = await (await grant(member.id)).json() as { id: string }

    expect((await send('POST', `/api/admin/memberships/${id}/confirm`, {}, cookie)).status).toBe(200)
    expect((await send('POST', `/api/admin/memberships/${id}/confirm`, {}, cookie)).status).toBe(409)

    const held = read<{ at: number | null, by: string | null }>(
      'SELECT confirmed_at AS at, confirmed_by AS by FROM memberships WHERE id = ?', id)!
    expect(held.at).not.toBeNull()
    expect(held.by).not.toBeNull()
  })

  test('a purchase date in the future and an erased account are both refused', async () => {
    const member = await registerMember(app, 'future-buy', password, { signIn: false })
    const ahead = londonDay(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
    expect((await grant(member.id, { startsOn: ahead })).status).toBe(400)

    const gone = await registerMember(app, 'erased-member', password)
    expect((await send('POST', `/api/admin/accounts/${gone.id}/security`, { operation: 'erase' }, cookie)).status).toBe(200)
    expect((await grant(gone.id)).status).toBe(409)
  })

  // Criterion 3: lapsing is read at query time, so a term that ran out overnight stops counting
  // without a sweep having to run (0009).
  test('a lapsed term drops out of current, and the grace window holds it a little longer', async () => {
    const member = await registerMember(app, 'lapsing', password, { signIn: false })
    const { id } = await (await grant(member.id)).json() as { id: string }

    // Both dates move: the schema refuses a term that ends before it starts, which is the point
    // of the constraint.
    const grace = (await register()).graceDays
    const daysAgo = (days: number): string => londonDay(new Date(Date.now() - days * 24 * 60 * 60 * 1000))

    write('UPDATE memberships SET starts_on = ?, expires_on = ? WHERE id = ?', daysAgo(400), daysAgo(grace - 1), id)
    expect((await register('?filter=current')).items.some(row => row.id === id)).toBe(true)

    write('UPDATE memberships SET starts_on = ?, expires_on = ? WHERE id = ?', daysAgo(800), daysAgo(grace + 30), id)
    expect((await register('?filter=current')).items.some(row => row.id === id)).toBe(false)
    expect((await register('?filter=lapsed')).items.some(row => row.id === id)).toBe(true)
  })

  test('the register exports as CSV and records having been taken', async () => {
    const before = read<{ n: number }>('SELECT count(*) n FROM audit_log WHERE action = ?', 'membership.exported')!.n

    const response = await send('GET', '/api/admin/memberships/export?filter=everyone', null, cookie)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')

    const [header, ...lines] = (await response.text()).split('\n')
    expect(header).toBe('name,email,studentId,startsOn,expiresOn,source,confirmed')
    expect(lines.length).toBeGreaterThan(0)

    const after = read<{ n: number }>('SELECT count(*) n FROM audit_log WHERE action = ?', 'membership.exported')!.n
    expect(after).toBe(before + 1)
  })

  test('recording one needs the permission', async () => {
    const stranger = await registerMember(app, 'not-secretary', password)
    expect((await send('GET', '/api/admin/memberships', null, stranger.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/memberships', { userId: stranger.id, startsOn: today, years: 1 }, stranger.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('reminding a membership that is running out (A-117 criterion 3)', () => {
  test('the sweep reminds once, and only inside the notice window', async () => {
    const soon = await registerMember(app, 'expiring-soon', password, { signIn: false })
    const later = await registerMember(app, 'expiring-later', password, { signIn: false })
    const { id: soonId } = await (await grant(soon.id)).json() as { id: string }
    const { id: laterId } = await (await grant(later.id)).json() as { id: string }

    const notice = 21
    write('UPDATE memberships SET expires_on = ? WHERE id = ?',
      londonDay(new Date(Date.now() + (notice - 2) * 24 * 60 * 60 * 1000)), soonId)
    write('UPDATE memberships SET expires_on = ? WHERE id = ?',
      londonDay(new Date(Date.now() + (notice + 60) * 24 * 60 * 60 * 1000)), laterId)

    expect((await fetch(`${app.baseURL}/_nitro/tasks/daily:sweeps`, { method: 'POST' })).status).toBe(200)

    const noticed = (id: string): number | null =>
      read<{ at: number | null }>('SELECT renewal_notice_at AS at FROM memberships WHERE id = ?', id)!.at
    expect(noticed(soonId)).not.toBeNull()
    expect(noticed(laterId)).toBeNull()

    // Recorded on the row, so a second night does not send a second message.
    const first = noticed(soonId)
    expect((await fetch(`${app.baseURL}/_nitro/tasks/daily:sweeps`, { method: 'POST' })).status).toBe(200)
    expect(noticed(soonId)).toBe(first)
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
