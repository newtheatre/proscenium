import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { adminSession, forgetSpentStep, registerMember, request } from '#tests/helpers/accounts'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, fillPin, openSignedOutView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// #911. A read-only role sees only what it can do: the routes already refuse the write, so this
// pins that the console stops offering it in the first place (0040).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest
let admin: TestMember

interface Officer extends TestMember { password: string, secret: string }

async function officerWith(prefix: string, role: string): Promise<Officer> {
  const password = generatePassword()
  const member = await registerMember(app, prefix, password)
  const { secret } = await (await request(app, 'POST', '/api/account/mfa/enrol', {}, member.cookie)).json() as { secret: string }
  await request(app, 'POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, member.cookie)
  await request(app, 'POST', '/api/admin/roles', { userId: member.id, role }, admin.cookie)
  return { ...member, password, secret }
}

async function signedInView(officer: Officer): Promise<Bun.WebView> {
  forgetSpentStep(app, officer.email)
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', officer.email)
  await fill(view, 'form input[type="password"]', officer.password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, 'document.querySelectorAll(\'[data-test="mfa-challenge"] input\').length >= 6')
  await fillPin(view, '[data-test="mfa-challenge"] input', await codeForStep(officer.secret, stepFor(new Date()) + 1))
  await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
  return view
}

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

describe.skipIf(skip !== null)('the rooms console gates its write controls on rooms.write (#911)', () => {
  test('a TRAINING_MANAGER (rooms.read only) sees no write control on any of the three screens', async () => {
    const trainingManager = await officerWith('training-mgr', 'TRAINING_MANAGER')
    const room = await (await send('POST', '/api/admin/rooms', { name: `Gate ${crypto.randomUUID().slice(0, 6)}` })).json() as { id: string }
    await send('POST', '/api/admin/rooms/blackouts', {
      roomId: room.id,
      reason: 'Gating check',
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 90_000_000).toISOString(),
    })
    await send('POST', '/api/admin/rooms/external-spaces', { name: `Other ${crypto.randomUUID().slice(0, 6)}` })

    const view = await signedInView(trainingManager)
    try {
      await visit(view, `${app.baseURL}/rooms/manage`, '[data-test="rooms-table"]')
      expect(await view.evaluate<boolean>('!!document.querySelector(\'[data-test="add-room"]\')')).toBe(false)
      expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="edit-room-${room.id}"]')`)).toBe(false)

      await visit(view, `${app.baseURL}/rooms/manage/closures`, '[data-test="blackouts-table"]')
      expect(await view.evaluate<boolean>('!!document.querySelector(\'[data-test="close-room"]\')')).toBe(false)
      expect(await view.evaluate<boolean>('!!document.querySelector(\'[data-test^="reopen-"]\')')).toBe(false)

      await visit(view, `${app.baseURL}/rooms/manage/other`, '[data-test="spaces-table"]')
      expect(await view.evaluate<boolean>('!!document.querySelector(\'[data-test="add-space"]\')')).toBe(false)
      expect(await view.evaluate<boolean>('!!document.querySelector(\'[data-test^="edit-space-"]\')')).toBe(false)
    }
    finally {
      view.close()
    }
  }, 120_000)
})

describe.skipIf(skip !== null)('the people console gates its write controls on fellowships.write and members.write (#911)', () => {
  test('a THEATRE_MANAGER (read only on both rolls) sees no write control on either screen', async () => {
    const theatreManager = await officerWith('theatre-mgr', 'THEATRE_MANAGER')
    const fellow = await registerMember(app, 'fellow-subject', generatePassword())
    await send('POST', '/api/admin/fellowships', {
      userId: fellow.id,
      awardedOn: '2020-01-01',
      awardedBy: 'Committee, 1 January 2020',
      citation: 'For services to the gating test.',
    })

    const view = await signedInView(theatreManager)
    try {
      await visit(view, `${app.baseURL}/people/fellows`, '[data-test="fellows-table"]')
      expect(await view.evaluate<boolean>('!!document.querySelector(\'[data-test="award"]\')')).toBe(false)
      expect(await view.evaluate<boolean>('!!document.querySelector(\'[data-test="revoke"]\')')).toBe(false)

      await visit(view, `${app.baseURL}/people/members`, '[data-test="members-table"]')
      expect(await view.evaluate<boolean>('!!document.querySelector(\'[data-test="record-membership"]\')')).toBe(false)
      expect(await view.evaluate<boolean>('!!document.querySelector(\'[data-test="confirm"]\')')).toBe(false)
    }
    finally {
      view.close()
    }
  }, 120_000)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
