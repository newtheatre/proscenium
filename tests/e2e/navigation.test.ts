import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// The sidebar is filtered by what the caller holds (0040). Asserted against the server-rendered
// HTML, because that is what a person sees before a script runs, and it is what a guard agrees with.
const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let trainer: TestMember
let member: TestMember

// Asserted on hrefs rather than labels: a word like System appears in a stylesheet too, and a
// test that passes for the wrong reason is worse than no test.
const BOX_OFFICE = ['/box-office/ticket-types']
const SPACES = ['/rooms/manage', '/rooms/manage/requests', '/rooms/manage/closures', '/rooms/manage/other', '/rooms/manage/utilisation']
const PEOPLE = ['/people/accounts', '/people/members', '/people/fellows']
const SYSTEM = ['/admin/settings', '/admin/audit']

async function shell(cookie: string, path = '/admin'): Promise<{ status: number, html: string }> {
  const answer = await fetch(`${app.baseURL}${path}`, { headers: { cookie } })
  return { status: answer.status, html: await answer.text() }
}

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  member = await registerMember(app, 'ordinary', generatePassword())

  // Granted through the route that records who did it, which is the only sanctioned path.
  trainer = await registerMember(app, 'trainer', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: trainer.id, role: 'TRAINING_MANAGER' }, officer.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

describe.skipIf(skip !== null)('the console sidebar shows what the caller holds (0040)', () => {
  test('an administrator sees every group', async () => {
    const { status, html } = await shell(officer.cookie)
    expect(status).toBe(200)
    for (const href of [...BOX_OFFICE, ...SPACES, ...PEOPLE, ...SYSTEM]) {
      expect(html).toContain(`href="${href}"`)
    }
  })

  // The one role whose sidebar is genuinely partial: it reads rooms but cannot decide a request,
  // reads accounts and the register but not the roll, and holds nothing in System.
  test('a training manager sees a partial sidebar', async () => {
    const { status, html } = await shell(trainer.cookie)
    expect(status).toBe(200)
    for (const href of ['/rooms/manage', '/rooms/manage/closures', '/people/accounts', '/people/members']) {
      expect(html).toContain(`href="${href}"`)
    }
    for (const href of ['/rooms/manage/requests', '/people/fellows', ...BOX_OFFICE, ...SYSTEM]) {
      expect(html).not.toContain(`href="${href}"`)
    }
  })

  test('a group with nothing visible in it does not render', async () => {
    const { html } = await shell(trainer.cookie)
    // System holds nothing for this role, and the modules that have not landed hold nothing yet.
    expect(html).not.toContain('Box office')
    expect(html).not.toContain('Communications')
  })

  test('somebody holding no permission is refused rather than shown an empty shell', async () => {
    const { status } = await shell(member.cookie)
    expect(status).toBe(403)
  })

  test('a signed-out caller is sent to sign in', async () => {
    const answer = await fetch(`${app.baseURL}/admin`, { redirect: 'manual' })
    expect([302, 303].includes(answer.status) || answer.url.includes('sign-in')).toBe(true)
  })
})

describe.skipIf(skip !== null)('a deep link is guarded by the same declaration as the sidebar', () => {
  test('a screen the caller cannot see refuses when typed into the bar', async () => {
    expect((await shell(trainer.cookie, '/rooms/manage/requests')).status).toBe(403)
    expect((await shell(trainer.cookie, '/people/fellows')).status).toBe(403)
    expect((await shell(trainer.cookie, '/admin/settings')).status).toBe(403)
  })

  test('a screen the caller can see opens', async () => {
    expect((await shell(trainer.cookie, '/people/accounts')).status).toBe(200)
    expect((await shell(trainer.cookie, '/rooms/manage')).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('an old link still arrives (0040)', () => {
  test('the moved screens forward to where they went', async () => {
    const moved = await fetch(`${app.baseURL}/admin/people`, { headers: { cookie: officer.cookie }, redirect: 'manual' })
    expect([200, 302, 303]).toContain(moved.status)
    expect((await shell(officer.cookie, '/admin/people')).html).toContain('Accounts')
  })
})
