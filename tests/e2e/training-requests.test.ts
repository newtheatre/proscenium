import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { londonParts } from '#shared/utils/london'
import { adminSession, markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// G-104. A request is a demand signal and nothing else, and declining is a reply the member reads.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let cookie = ''
let department = ''

const password = generatePassword()
const member = { ...syntheticPerson(17), email: registrableAddress('ask-member') }
let memberId = ''
let memberCookie = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  cookie = (await adminSession(app)).cookie

  await send('POST', '/api/auth/register', { email: member.email, name: member.name, password }, '')
  markVerified(app, member.email)
  memberId = read<{ id: string }>('SELECT id FROM users WHERE email = ?', member.email)!.id
  const signedIn = await send('POST', '/api/auth/sign-in', { email: member.email, password }, '')
  memberCookie = (signedIn.headers.get('set-cookie') ?? '').split(';')[0]!

  department = `ASK${suffix()}`
  const made = await send('POST', '/api/admin/training/departments', { code: department, name: 'Asking' })
  expect(made.status).toBe(200)
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

function daysFrom(days: number): string {
  const now = londonParts(new Date())
  return new Date(Date.UTC(now.year, now.month - 1, now.day + days)).toISOString().slice(0, 10)
}

async function addModule(over: Record<string, unknown> = {}): Promise<string> {
  const id = `ASK-${suffix()}`
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

const ask = (moduleId: string, note?: string, as = memberCookie): Promise<Response> =>
  send('POST', '/api/training/requests', { moduleId, note }, as)

const said = async (answered: Response): Promise<string> =>
  (await answered.json() as { statusMessage?: string }).statusMessage ?? ''

const statusOf = (moduleId: string): string | undefined =>
  read<{ status: string }>(
    'SELECT status FROM module_requests WHERE module_id = ? AND user_id = ? ORDER BY rowid DESC',
    moduleId, memberId,
  )?.status

describe.skipIf(skip !== null)('one open ask per module (G-104 criterion 1)', () => {
  test('asking twice is refused, and the refusal says why', async () => {
    const module = await addModule()
    expect((await ask(module, 'Free most Thursdays')).status).toBe(200)

    const refused = await ask(module)
    expect(refused.status).toBe(409)
    expect(await said(refused)).toContain('already asked')
  })

  test('withdrawing frees the re-ask', async () => {
    const module = await addModule()
    const first = await (await ask(module)).json() as { id: string }
    expect((await send('DELETE', `/api/training/requests/${first.id}`, undefined, memberCookie)).status).toBe(200)
    expect(statusOf(module)).toBe('WITHDRAWN')

    expect((await ask(module)).status).toBe(200)
    expect(statusOf(module)).toBe('OPEN')
  })

  test('withdrawing somebody else\'s ask does nothing', async () => {
    const module = await addModule()
    const mine = await (await ask(module)).json() as { id: string }

    const other = await adminSession(app, { roles: [] })
    const answered = await send('DELETE', `/api/training/requests/${mine.id}`, undefined, other.cookie)
    expect((await answered.json() as { withdrawn: number }).withdrawn).toBe(0)
    expect(statusOf(module)).toBe('OPEN')
  })
})

describe.skipIf(skip !== null)('what may be asked for (G-104 criterion 6)', () => {
  test('a draft and a retired module are both refused', async () => {
    const draft = await addModule({ status: 'DRAFT' })
    const retired = await addModule({ status: 'RETIRED' })
    expect((await ask(draft)).status).toBe(409)
    expect((await ask(retired)).status).toBe(409)
  })

  test('a module that does not exist is a 404', async () => {
    expect((await ask('ASK-NOPE')).status).toBe(404)
  })

  test('signed out, nobody may ask', async () => {
    expect((await ask(await addModule(), undefined, '')).status).toBe(401)
  })
})

describe.skipIf(skip !== null)('the demand board (G-104 criterion 2)', () => {
  test('it orders by how many are waiting, and names them', async () => {
    const wanted = await addModule()
    const quieter = await addModule()

    await ask(wanted, 'I need this for the get-in')
    await ask(quieter)
    const second = await adminSession(app, { roles: [] })
    await send('POST', '/api/training/requests', { moduleId: wanted }, second.cookie)

    const board = await (await send('GET', '/api/admin/training/requests')).json() as {
      items: { moduleId: string, waiting: number, requesters: { name: string, note: string | null }[] }[]
    }
    const busiest = board.items.find(one => one.moduleId === wanted)
    expect(busiest?.waiting).toBe(2)
    expect(busiest?.requesters.some(one => one.note === 'I need this for the get-in')).toBe(true)

    const positions = board.items.map(one => one.moduleId)
    expect(positions.indexOf(wanted)).toBeLessThan(positions.indexOf(quieter))
  })

  test('a member may not read the board', async () => {
    expect((await send('GET', '/api/admin/training/requests', undefined, memberCookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('declining is answering (G-104 criterion 3)', () => {
  test('a reason is mandatory, and the requester is shown it', async () => {
    const module = await addModule()
    const asked = await (await ask(module)).json() as { id: string }

    expect((await send('POST', `/api/admin/training/requests/${asked.id}/decline`, {})).status).toBe(400)
    expect((await send('POST', `/api/admin/training/requests/${asked.id}/decline`, { reason: 'no' })).status).toBe(400)
    expect(statusOf(module)).toBe('OPEN')

    const answered = await send('POST', `/api/admin/training/requests/${asked.id}/decline`, {
      reason: 'Not running this term, but it is on the list for next',
    })
    expect(answered.status).toBe(200)
    expect(statusOf(module)).toBe('DECLINED')

    const mine = await (await send('GET', '/api/training/requests', undefined, memberCookie)).json() as {
      items: { moduleId: string, reason: string | null }[]
    }
    expect(mine.items.find(one => one.moduleId === module)?.reason)
      .toBe('Not running this term, but it is on the list for next')
  })

  test('answering twice is refused, and it is on the trail', async () => {
    const module = await addModule()
    const asked = await (await ask(module)).json() as { id: string }
    const body = { reason: 'The rig is out of action until next week' }

    expect((await send('POST', `/api/admin/training/requests/${asked.id}/decline`, body)).status).toBe(200)
    expect((await send('POST', `/api/admin/training/requests/${asked.id}/decline`, body)).status).toBe(409)

    expect(read<{ n: number }>(
      `SELECT count(*) n FROM audit_log WHERE action = 'request.declined' AND target = ?`, `request:${asked.id}`,
    )?.n).toBe(1)
  })

  // The reason is shown to the member and stays out of the trail: detail carries identifiers and
  // never words about a person (0011).
  test('the reason never reaches the audit trail', async () => {
    const module = await addModule()
    const asked = await (await ask(module)).json() as { id: string }
    await send('POST', `/api/admin/training/requests/${asked.id}/decline`, {
      reason: 'Not until the workshop is cleared',
    })

    const entry = read<{ detail: string }>(
      `SELECT detail FROM audit_log WHERE target = ?`, `request:${asked.id}`,
    )
    expect(entry?.detail ?? '').not.toContain('workshop')
  })
})

// Criterion 4. A session members can see resolves the asks it answers; one they cannot see yet
// resolves nothing, because there is nothing for them to sign up to.
describe.skipIf(skip !== null)('a scheduled session answers the asks (G-104 criterion 4)', () => {
  test('opening a session resolves the waiting asks and tells each requester once', async () => {
    const module = await addModule()
    const asked = await (await ask(module)).json() as { id: string }

    const scheduled = await send('POST', '/api/admin/training/sessions', {
      heldOn: daysFrom(14),
      startsAt: '19:00',
      endsAt: '21:00',
      capacity: 20,
      moduleIds: [module],
    })
    expect(scheduled.status).toBe(200)
    expect(statusOf(module)).toBe('SCHEDULED')

    // Once per request, held by the ledger's claim rather than by a read.
    expect(read<{ n: number }>(
      `SELECT count(*) n FROM notification_log WHERE claim = ?`,
      `training.request.scheduled:${asked.id}`,
    )?.n).toBe(1)
  })

  test('a session that has not opened yet resolves nothing', async () => {
    const module = await addModule()
    await ask(module)

    const scheduled = await send('POST', '/api/admin/training/sessions', {
      heldOn: daysFrom(21),
      startsAt: '19:00',
      endsAt: '21:00',
      capacity: 20,
      moduleIds: [module],
      opensAt: Math.floor(Date.now() / 1000) + 86_400,
    })
    expect(scheduled.status).toBe(200)
    expect(statusOf(module)).toBe('OPEN')
  })
})

describe.skipIf(skip !== null)('the member screen (G-104)', () => {
  test('a member asks from their own training page', async () => {
    const module = await addModule({ name: 'Driving the desk' })
    const view = await openSignedOutView(app.baseURL)

    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', member.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`, 30_000)

      await visit(view, `${app.baseURL}/training`, '[data-test="training-page"]')
      expect(await textOf(view, 'body')).not.toContain('Internal Server Error')
      await waitFor(view, `document.querySelector('[data-test="next-${module}"]')`, 30_000)
    }
    finally {
      view.close()
    }

    // Asked through the route the screen uses, then read back on the member's own list.
    expect((await ask(module, 'Free on Thursdays')).status).toBe(200)
    const mine = await (await send('GET', '/api/training/requests', undefined, memberCookie)).json() as {
      items: { moduleId: string, note: string | null, status: string }[]
    }
    expect(mine.items.find(one => one.moduleId === module))
      .toMatchObject({ note: 'Free on Thursdays', status: 'OPEN' })
  }, CASE_TIMEOUT_MS)
})
