import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { endOfTerm, londonDay } from '#shared/utils/membership'
import { forgetSpentStep, markVerified, registerMember } from '#tests/helpers/accounts'
import { expectOneWinner, race } from '#tests/helpers/race'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// A-130. A member says what they bought at the SU; an officer writes it down or says why not.
// Nothing here creates a membership without the officer (0031, A-202).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(93), email: registrableAddress('membership-secretary') }
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
  const carriesBody = method !== 'GET' && method !== 'HEAD' && method !== 'DELETE'
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

const today = londonDay(new Date())
let numbered = 20_990_100
const nextNumber = (): string => String(numbered++)

interface Claim { id: string, studentId: string, startsOn: string, term: number, status: string, reason: string | null }
interface Own { membership: { startsOn: string, expiresOn: string } | null, state: { kind: string }, claim: Claim | null }

const claim = (as: TestMember, over: Record<string, unknown> = {}): Promise<Response> =>
  send('POST', '/api/account/membership/claim', { studentId: nextNumber(), startsOn: today, term: 1, ...over }, as.cookie)

async function own(as: TestMember): Promise<Own> {
  const response = await send('GET', '/api/account/membership', undefined, as.cookie)
  expect(response.status).toBe(200)
  return await response.json() as Own
}

interface Queued { id: string, userId: string, studentId: string, heldUntil: string | null }

async function queue(query = ''): Promise<{ items: Queued[], total: number }> {
  const response = await send('GET', `/api/admin/memberships/claims${query}`, undefined, cookie)
  expect(response.status).toBe(200)
  return await response.json() as { items: Queued[], total: number }
}

const said = async (response: Response): Promise<string> =>
  (await response.json() as { statusMessage?: string }).statusMessage ?? ''

describe.skipIf(skip !== null)('claiming (A-130 criterion 1)', () => {
  test('a member claims once, sees it waiting, and a second claim is refused', async () => {
    const member = await registerMember(app, 'claimant', password)
    const made = await claim(member, { term: 3 })
    expect(made.status).toBe(200)

    const mine = await own(member)
    expect(mine.membership).toBeNull()
    expect(mine.state.kind).toBe('none')
    expect(mine.claim).toMatchObject({ status: 'OPEN', term: 3, startsOn: today })

    const again = await claim(member)
    expect(again.status).toBe(409)
    expect(await said(again)).toMatch(/already/i)
  })

  test('two claims fired together leave one', async () => {
    const member = await registerMember(app, 'twice', password)
    expectOneWinner(await race(2, () => claim(member)))
    expect(read<{ n: number }>(`SELECT count(*) n FROM membership_claims WHERE user_id = ?`, member.id)!.n).toBe(1)
  })

  test('a purchase in the future, a term of two, and a blank number are all refused', async () => {
    const member = await registerMember(app, 'hopeful', password)
    const ahead = londonDay(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
    expect((await claim(member, { startsOn: ahead })).status).toBe(400)
    expect((await claim(member, { term: 2 })).status).toBe(400)
    expect((await claim(member, { studentId: '  ' })).status).toBe(400)
    expect(read<{ n: number }>(`SELECT count(*) n FROM membership_claims WHERE user_id = ?`, member.id)!.n).toBe(0)
  })

  test('withdrawing frees the next claim, and is nothing to do twice', async () => {
    const member = await registerMember(app, 'changed-mind', password)
    expect((await claim(member)).status).toBe(200)

    const withdrawn = await send('DELETE', '/api/account/membership/claim', undefined, member.cookie)
    expect(withdrawn.status).toBe(200)
    expect((await withdrawn.json() as { withdrawn: number }).withdrawn).toBe(1)
    expect((await own(member)).claim?.status).toBe('WITHDRAWN')

    const nothing = await send('DELETE', '/api/account/membership/claim', undefined, member.cookie)
    expect((await nothing.json() as { withdrawn: number }).withdrawn).toBe(0)

    expect((await claim(member)).status).toBe(200)
  })

  test('signed out, nobody may claim or read', async () => {
    expect((await send('POST', '/api/account/membership/claim', { studentId: '1', startsOn: today, term: 1 })).status).toBe(401)
    expect((await send('GET', '/api/account/membership')).status).toBe(401)
  })
})

describe.skipIf(skip !== null)('the officer records or declines (A-130 criteria 2, 3, 5)', () => {
  test('the queue lists open claims oldest first, paged, and finds one by number', async () => {
    const first = await registerMember(app, 'queued-first', password)
    const second = await registerMember(app, 'queued-second', password)
    const number = nextNumber()
    expect((await claim(first, { studentId: number })).status).toBe(200)
    expect((await claim(second)).status).toBe(200)

    const listed = await queue('?pageSize=100')
    const positions = listed.items.map(item => item.userId)
    expect(positions.indexOf(first.id)).toBeGreaterThanOrEqual(0)
    expect(positions.indexOf(first.id)).toBeLessThan(positions.indexOf(second.id))

    const found = await queue(`?search=${number}`)
    expect(found.items).toHaveLength(1)
    expect(found.items[0]!.userId).toBe(first.id)

    const page = await queue('?pageSize=1')
    expect(page.items).toHaveLength(1)
    expect(page.total).toBeGreaterThanOrEqual(2)
  })

  test('recording writes the number to the account, one membership evidenced by the claim, and closes it', async () => {
    const member = await registerMember(app, 'recorded', password)
    const number = nextNumber()
    const { id } = await (await claim(member, { studentId: number, term: 3 })).json() as { id: string }

    const recorded = await send('POST', `/api/admin/memberships/claims/${id}/record`, {}, cookie)
    expect(recorded.status).toBe(200)
    expect((await recorded.json() as { expiresOn: string }).expiresOn).toBe(endOfTerm(today, 3))

    expect(read<{ studentId: string }>('SELECT student_id AS studentId FROM users WHERE id = ?', member.id)!.studentId).toBe(number)
    const memberships = read<{ n: number, evidence: string, source: string }>(
      `SELECT count(*) n, min(evidence) evidence, min(source) source FROM memberships WHERE user_id = ?`, member.id)!
    expect(memberships).toEqual({ n: 1, evidence: `claim ${id}`, source: 'MANUAL' })

    const mine = await own(member)
    expect(mine.state.kind).toBe('current')
    expect(mine.claim?.status).toBe('RECORDED')

    // Criterion 5: the trail names the claim and never the number (0011).
    const entry = read<{ detail: string, target: string }>(
      `SELECT detail, target FROM audit_log WHERE action = 'membership.claim.recorded' AND target = ?`, `claim:${id}`)!
    expect(entry.detail).toContain(id)
    expect(`${entry.target} ${entry.detail}`).not.toContain(number)

    // Criterion 3: the decision is notified through the notification centre.
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'membership.claim.recorded'`, member.id)!.n).toBe(1)

    expect((await send('POST', `/api/admin/memberships/claims/${id}/record`, {}, cookie)).status).toBe(409)
  })

  test('two officers recording together leave exactly one membership', async () => {
    const member = await registerMember(app, 'raced', password)
    const { id } = await (await claim(member)).json() as { id: string }

    expectOneWinner(await race(2, () => send('POST', `/api/admin/memberships/claims/${id}/record`, {}, cookie)))
    expect(read<{ n: number }>(`SELECT count(*) n FROM memberships WHERE user_id = ?`, member.id)!.n).toBe(1)
    expect(read<{ n: number }>(`SELECT count(*) n FROM audit_log WHERE action = 'membership.claim.recorded' AND target = ?`, `claim:${id}`)!.n).toBe(1)
  })

  test('the queue says when the account already holds a term, so a hand-recorded one is not written twice', async () => {
    const member = await registerMember(app, 'already-held', password)
    const { id } = await (await claim(member)).json() as { id: string }
    expect((await send('POST', '/api/admin/memberships', { userId: member.id, startsOn: today, years: 1 }, cookie)).status).toBe(200)

    const listed = await queue(`?search=${encodeURIComponent(member.email)}`)
    expect(listed.items.find(item => item.id === id)).toMatchObject({ heldUntil: endOfTerm(today, 1) })
  })

  test('a number another account already holds is refused rather than moved', async () => {
    const holder = await registerMember(app, 'holder', password)
    const number = nextNumber()
    expect((await send('POST', '/api/admin/memberships', { userId: holder.id, startsOn: today, years: 1, studentId: number }, cookie)).status).toBe(200)

    const claimant = await registerMember(app, 'clasher', password)
    const { id } = await (await claim(claimant, { studentId: number })).json() as { id: string }
    const refused = await send('POST', `/api/admin/memberships/claims/${id}/record`, {}, cookie)
    expect(refused.status).toBe(409)
    expect(await said(refused)).toMatch(/student number/i)
    expect((await own(claimant)).claim?.status).toBe('OPEN')
  })

  test('declining needs a reason, and the member reads it', async () => {
    const member = await registerMember(app, 'declined', password)
    const { id } = await (await claim(member)).json() as { id: string }

    expect((await send('POST', `/api/admin/memberships/claims/${id}/decline`, {}, cookie)).status).toBe(400)
    expect((await send('POST', `/api/admin/memberships/claims/${id}/decline`, { reason: 'no' }, cookie)).status).toBe(400)

    const reason = 'The SU has no record under that number: check it against your card and claim again'
    expect((await send('POST', `/api/admin/memberships/claims/${id}/decline`, { reason }, cookie)).status).toBe(200)

    const mine = await own(member)
    expect(mine.claim).toMatchObject({ id, status: 'DECLINED', reason })
    expect(mine.membership).toBeNull()

    const entry = read<{ detail: string }>(`SELECT detail FROM audit_log WHERE action = 'membership.claim.declined' AND target = ?`, `claim:${id}`)!
    expect(entry.detail).not.toContain('SU has no record')
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'membership.claim.declined'`, member.id)!.n).toBe(1)

    // Answered once: a second decline, or a record, is a loser however quickly it follows.
    expect((await send('POST', `/api/admin/memberships/claims/${id}/decline`, { reason }, cookie)).status).toBe(409)
    expect((await send('POST', `/api/admin/memberships/claims/${id}/record`, {}, cookie)).status).toBe(409)
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE user_id = ? AND type = 'membership.claim.declined'`, member.id)!.n).toBe(1)

    // A declined claim is put right by claiming again.
    expect((await claim(member)).status).toBe(200)
  })

  test('an erased account cannot claim, and its open claim leaves the queue', async () => {
    const member = await registerMember(app, 'erased-claimant', password)
    const { id } = await (await claim(member)).json() as { id: string }
    expect((await send('POST', `/api/admin/accounts/${member.id}/security`, { operation: 'erase' }, cookie)).status).toBe(200)

    expect((await queue('?pageSize=100')).items.some(item => item.id === id)).toBe(false)
    expect((await send('POST', `/api/admin/memberships/claims/${id}/record`, {}, cookie)).status).toBe(409)
    expect(read<{ studentId: string }>('SELECT student_id AS studentId FROM membership_claims WHERE id = ?', id)!.studentId).toBe('')
  })

  test('the queue and its decisions need the permission', async () => {
    const stranger = await registerMember(app, 'not-secretary', password)
    const { id } = await (await claim(stranger)).json() as { id: string }
    expect((await send('GET', '/api/admin/memberships/claims', undefined, stranger.cookie)).status).toBe(403)
    expect((await send('POST', `/api/admin/memberships/claims/${id}/record`, {}, stranger.cookie)).status).toBe(403)
    expect((await send('POST', `/api/admin/memberships/claims/${id}/decline`, { reason: 'Because I say so' }, stranger.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('the screens (A-130 criterion 4)', () => {
  test('a member sees their state, claims from the page, and sees the claim waiting', async () => {
    const member = await registerMember(app, 'on-screen', password, { signIn: false })
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', member.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/account/membership`, '[data-test="membership-state"]')
      expect(await textOf(view, '[data-test="membership-state"]')).toContain('No membership')

      await fill(view, 'input[data-test="claim-student-id"]', nextNumber())
      await click(view, '[data-test="claim-submit"]')
      await waitFor(view, `document.querySelector('[data-test="claim-open"]')`, 30_000)
      expect(await textOf(view, '[data-test="claim-open"]')).toContain('Waiting')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the register\'s awaiting-record filter records a claim in one click', async () => {
    const member = await registerMember(app, 'clicked', password)
    const { id } = await (await claim(member)).json() as { id: string }

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', officer.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)
      const code = await codeForStep(secret, stepFor(new Date()) + 1)
      for (const [index, digit] of [...code].entries()) {
        await fill(view, `[data-test="mfa-challenge"] input:nth-of-type(${index + 1})`, digit)
      }
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/people/members?filter=awaiting-record`, '[data-test="claims-table"]')
      await waitFor(view, `document.querySelector('[data-test="claim-record-${id}"]')`, 30_000)
      await click(view, `[data-test="claim-record-${id}"]`)
      await waitFor(view, `!document.querySelector('[data-test="claim-record-${id}"]')`, 30_000)

      expect(read<{ n: number }>(`SELECT count(*) n FROM memberships WHERE user_id = ?`, member.id)!.n).toBe(1)
      expect(read<{ status: string }>('SELECT status FROM membership_claims WHERE id = ?', id)!.status).toBe('RECORDED')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
