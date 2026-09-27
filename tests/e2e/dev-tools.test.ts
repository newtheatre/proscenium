import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { request } from '#tests/helpers/accounts'
import { skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// K-124 criterion 1: reaching a privileged screen locally must not begin with registering an
// account, fetching a token out of a mailbox and enrolling an authenticator.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

interface Tools {
  session: { factor: boolean } | null
  personas: { email: string, account: { id: string } | null }[]
}

describe('a seeded persona already carries a second factor', () => {
  test.skipIf(Boolean(skip))('a privileged role reaches an admin screen with no enrolment step', async () => {
    // Twice, deliberately (#927): the second run takes the held branch for every persona, which
    // is the one a database seeded on an earlier build exercises, and must still carry a factor.
    await request(app, 'POST', '/api/dev/seed')
    await request(app, 'POST', '/api/dev/seed')

    const before = await (await request(app, 'GET', '/api/dev')).json() as Tools
    const admin = before.personas.find(persona => persona.email === 'dev-admin@e2e.newtheatre.org.uk')
    expect(admin?.account).toBeTruthy()

    const signedIn = await request(app, 'POST', '/api/dev/sign-in-as', { userId: admin!.account!.id })
    const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

    const after = await (await request(app, 'GET', '/api/dev', undefined, cookie)).json() as Tools
    expect(after.session?.factor).toBe(true)

    // The real gate (A-112), not just the flag it reads: no 403 asking for an authenticator app.
    const admins = await request(app, 'GET', '/api/admin/accounts', undefined, cookie)
    expect(admins.status).toBe(200)
  })

  // Issue 1338: the room forms refuse before they open without a membership, so the persona
  // their pictures are taken as holds a current one, made or already held.
  test.skipIf(Boolean(skip))('the booker holds a current membership, and the ordinary member none', async () => {
    await request(app, 'POST', '/api/dev/seed')
    await request(app, 'POST', '/api/dev/seed')
    const tools = await (await request(app, 'GET', '/api/dev')).json() as Tools

    const stateOf = async (email: string): Promise<string> => {
      const persona = tools.personas.find(one => one.email === email)
      const signedIn = await request(app, 'POST', '/api/dev/sign-in-as', { userId: persona!.account!.id })
      const cookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!
      const session = await (await request(app, 'GET', '/api/auth/session', undefined, cookie)).json() as { membershipState: { kind: string } }
      return session.membershipState.kind
    }

    expect(await stateOf('dev-booker@e2e.newtheatre.org.uk')).toBe('current')
    expect(await stateOf('dev-member@e2e.newtheatre.org.uk')).toBe('none')
  })
})
