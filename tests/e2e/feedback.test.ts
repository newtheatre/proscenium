import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, markVerified, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// K-134: the button sits in the two operational shells and nowhere else, the route records one
// row and one trail line per report, and a reporter is limited (criteria 1 to 4).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let admin: TestMember
let member: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  member = await registerMember(app, 'feedback-member', generatePassword())
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = member.cookie): Promise<Response> =>
  request(app, method, path, body, as)

function read<T>(statement: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(statement).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

const BUTTON = 'data-test="feedback-open"'
const valid = { kind: 'BUG', body: 'The till froze after the second scan tonight.', path: '/tonight/till', shell: 'tonight' }

describe.skipIf(skip !== null)('the button is in the two operational shells and nowhere else (criterion 1)', () => {
  test('a console screen carries it', async () => {
    expect(await (await send('GET', '/admin', undefined, admin.cookie)).text()).toContain(BUTTON)
  })

  test('the tonight hub carries it for a signed-in member', async () => {
    expect(await (await send('GET', '/tonight')).text()).toContain(BUTTON)
  })

  test('the documentation, the member shell and the public site do not', async () => {
    expect(await (await send('GET', '/docs')).text()).not.toContain(BUTTON)
    expect(await (await send('GET', '/my')).text()).not.toContain(BUTTON)
    expect(await (await request(app, 'GET', '/', undefined, undefined)).text()).not.toContain(BUTTON)
  })

  test('a signed-out visitor to the hub sees no button', async () => {
    expect(await (await request(app, 'GET', '/tonight', undefined, undefined)).text()).not.toContain(BUTTON)
  })
})

describe.skipIf(skip !== null)('the route records one row and one trail line (criteria 2, 3)', () => {
  test('is refused signed out', async () => {
    expect((await request(app, 'POST', '/api/feedback', valid, undefined)).status).toBe(401)
  })

  test('a report lands with what the browser attached, and the trail carries no words', async () => {
    const answered = await send('POST', '/api/feedback', {
      ...valid,
      userAgent: 'Mozilla/5.0 (test)',
      recentFailures: [{ path: '/api/tonight/till', status: 500, message: 'Something went wrong', ray: 'ray-1', at: 1_790_000_000 }],
    })
    expect(answered.status).toBe(200)
    const { id } = await answered.json() as { id: string }

    const row = read<{ reporter_id: string, kind: string, body: string, page_path: string, shell: string, status: string, user_agent: string, recent_failures: string }>(
      'SELECT reporter_id, kind, body, page_path, shell, status, user_agent, recent_failures FROM feedback_reports WHERE id = ?', id)
    expect(row).toMatchObject({ reporter_id: member.id, kind: 'BUG', body: valid.body, page_path: '/tonight/till', shell: 'tonight', status: 'NEW', user_agent: 'Mozilla/5.0 (test)' })
    expect(JSON.parse(row!.recent_failures)).toEqual([{ path: '/api/tonight/till', status: 500, message: 'Something went wrong', ray: 'ray-1', at: 1_790_000_000 }])

    const audited = read<{ actor_id: string, target: string, detail: string }>(
      `SELECT actor_id, target, detail FROM audit_log WHERE action = 'feedback.submitted' AND target = ? LIMIT 1`, `feedback:${id}`)
    expect(audited?.actor_id).toBe(member.id)
    expect(JSON.parse(audited!.detail)).toEqual({ kind: 'BUG', path: '/tonight/till', shell: 'tonight' })
    expect(audited!.detail).not.toContain('froze')
  })

  test('too few words are refused before anything is written', async () => {
    const before = read<{ n: number }>('SELECT COUNT(*) AS n FROM feedback_reports')!.n
    expect((await send('POST', '/api/feedback', { ...valid, body: 'Broken.' })).status).toBe(400)
    expect(read<{ n: number }>('SELECT COUNT(*) AS n FROM feedback_reports')!.n).toBe(before)
  })
})

describe.skipIf(skip !== null)('a reporter is limited to ten an hour (criterion 4)', () => {
  test('the eleventh report is refused with a wait', async () => {
    const eager = await registerMember(app, 'feedback-eager', generatePassword())
    for (let sent = 1; sent <= 10; sent++) {
      expect((await send('POST', '/api/feedback', valid, eager.cookie)).status).toBe(200)
    }
    const refused = await send('POST', '/api/feedback', valid, eager.cookie)
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).not.toBeNull()
    expect(read<{ n: number }>('SELECT COUNT(*) AS n FROM feedback_reports WHERE reporter_id = ?', eager.id)!.n).toBe(10)
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the form in a browser (criterion 2)', () => {
  test('two taps and some words on the tonight hub become a row naming the hub', async () => {
    const password = generatePassword()
    const email = registrableAddress('feedback-browser')
    await request(app, 'POST', '/api/auth/register', { email, name: syntheticPerson(7).name, password })
    markVerified(app, email)

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')

      await visit(view, `${app.baseURL}/tonight`)
      await click(view, '[data-test="feedback-open"]')
      await waitFor(view, 'document.querySelector(\'[data-test="feedback-kind-IDEA"]\')')
      await click(view, '[data-test="feedback-kind-IDEA"]')
      await fill(view, '[data-test="feedback-body"]', 'A bigger back button on the door screen would help in the dark.')
      await click(view, '[data-test="feedback-submit"]')
      await waitFor(view, 'document.body.innerText.includes(\'Thanks, we have it\')')

      const userId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', email)!.id
      const row = read<{ kind: string, page_path: string, shell: string, user_agent: string | null }>(
        'SELECT kind, page_path, shell, user_agent FROM feedback_reports WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 1', userId)
      expect(row).toMatchObject({ kind: 'IDEA', page_path: '/tonight', shell: 'tonight' })
      expect(row?.user_agent).toBeTruthy()
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
