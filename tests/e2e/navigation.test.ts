import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { adminSession, grantRole, registerMember, request } from '#tests/helpers/accounts'
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
const BOX_OFFICE = ['/box-office/shows', '/box-office/ticket-types']
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
  await grantRole(app, trainer, 'TRAINING_MANAGER', officer.cookie)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

describe.skipIf(skip !== null)('the console sidebar shows what the caller holds (0040)', () => {
  // A closed group renders no children (issue 896), and a group opens when the route lands in it,
  // so each group's links are read from a page inside it.
  test('an administrator sees every group', async () => {
    for (const group of [BOX_OFFICE, SPACES, PEOPLE, SYSTEM]) {
      const { status, html } = await shell(officer.cookie, group[0]!)
      expect(status).toBe(200)
      for (const href of group) expect(html).toContain(`href="${href}"`)
    }
  })

  // The one role whose sidebar is genuinely partial: it reads rooms but cannot decide a request,
  // reads accounts and the register but not the roll, and holds nothing in System.
  test('a training manager sees a partial sidebar', async () => {
    const rooms = await shell(trainer.cookie, '/rooms/manage')
    const people = await shell(trainer.cookie, '/people/accounts')
    expect([rooms.status, people.status]).toEqual([200, 200])
    for (const href of ['/rooms/manage', '/rooms/manage/closures']) expect(rooms.html).toContain(`href="${href}"`)
    for (const href of ['/people/accounts', '/people/members']) expect(people.html).toContain(`href="${href}"`)
    for (const html of [rooms.html, people.html]) {
      for (const href of ['/rooms/manage/requests', '/people/fellows', ...BOX_OFFICE, ...SYSTEM]) {
        expect(html).not.toContain(`href="${href}"`)
      }
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

describe.skipIf(skip !== null)('the members area and account settings split (K-127 criterion 2)', () => {
  test('/my carries every MY_NAV destination for an ordinary member', async () => {
    const answer = await fetch(`${app.baseURL}/my`, { headers: { cookie: member.cookie } })
    expect(answer.status).toBe(200)
    const html = await answer.text()
    for (const href of ['/my', '/rota', '/rooms', '/training', '/account/passes', '/account/membership']) {
      expect(html).toContain(`href="${href}"`)
    }
  })

  // Tab holders ship unnamed, so a tab in the nav of everybody promised a page for nobody (F-108,
  // issue 1342); a named holder, or anybody still owing, is offered it.
  test('the bar tab is offered to an authorised holder and to nobody else', async () => {
    const tab = 'href="/account/bar-tab"'
    const session = async (): Promise<{ keepsBarTab?: boolean }> =>
      (await fetch(`${app.baseURL}/api/auth/session`, { headers: { cookie: member.cookie } })).json() as Promise<{ keepsBarTab?: boolean }>

    expect(await (await fetch(`${app.baseURL}/my`, { headers: { cookie: member.cookie } })).text()).not.toContain(tab)
    expect((await session()).keepsBarTab).toBe(false)

    const named = await request(app, 'PUT', '/api/admin/config/BAR_AUTHORISED_TAB_HOLDERS', { value: [member.id] }, officer.cookie)
    expect(named.status).toBe(200)
    try {
      expect((await session()).keepsBarTab).toBe(true)
      expect(await (await fetch(`${app.baseURL}/my`, { headers: { cookie: member.cookie } })).text()).toContain(tab)
    }
    finally {
      await request(app, 'PUT', '/api/admin/config/BAR_AUTHORISED_TAB_HOLDERS', { value: [] }, officer.cookie)
    }
  })

  test('access requirements sit with the account settings', async () => {
    const html = await (await fetch(`${app.baseURL}/account/profile`, { headers: { cookie: member.cookie } })).text()
    expect(html).toContain('href="/account/access"')
  })
})

// Issue 1358: the overview lists what waits for the caller and what is unfinished, from the same
// counts the sidebar reads, and only what the caller could act on.
describe.skipIf(skip !== null)('the overview is what waits for the caller (issue 1358)', () => {
  async function read<T>(cookie: string, path: string): Promise<{ status: number, body: T }> {
    const answer = await fetch(`${app.baseURL}${path}`, { headers: { cookie } })
    return { status: answer.status, body: await answer.json() as T }
  }

  test('an administrator is counted every queue, a training manager only the requests they answer', async () => {
    const everything = await read<{ counts: Record<string, number> }>(officer.cookie, '/api/admin/waiting')
    expect(everything.status).toBe(200)
    expect(Object.keys(everything.body.counts).sort()).toEqual(['access-profiles', 'membership-claims', 'pass-requests', 'room-requests', 'training-requests'])
    for (const count of Object.values(everything.body.counts)) expect(Number.isInteger(count)).toBe(true)

    expect((await read<{ counts: Record<string, number> }>(trainer.cookie, '/api/admin/waiting')).body.counts).toEqual({ 'training-requests': expect.any(Number) })
    expect((await read<{ counts: Record<string, number> }>(member.cookie, '/api/admin/waiting')).body.counts).toEqual({})
  })

  test('tonight is offered to whoever may open its screens, and set-up to whoever can finish it', async () => {
    const officerView = await read<{ setUp: unknown[], tonight: unknown[] | null }>(officer.cookie, '/api/admin/overview')
    expect(officerView.status).toBe(200)
    expect(Array.isArray(officerView.body.tonight)).toBe(true)
    expect(Array.isArray(officerView.body.setUp)).toBe(true)

    const trainerView = await read<{ setUp: unknown[], tonight: unknown[] | null }>(trainer.cookie, '/api/admin/overview')
    expect(trainerView.body.tonight).toBeNull()
    expect(trainerView.body.setUp).toEqual([])
  })

  test('the placeholder is gone from the overview', async () => {
    expect((await shell(officer.cookie)).html).not.toContain('The rest of this screen arrives')
  })
})
