import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { forgetSpentStep, markVerified, registerMember } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, pickOption, pickPerson, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// H-924: /comms/announce picks a session's sign-ups from a search, never a typed id (0032).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

const password = generatePassword()
const officer = { ...syntheticPerson(91), email: registrableAddress('announcer') }
let secret = ''

function send(method: string, path: string, body?: unknown, withCookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(withCookie ? { cookie: withCookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
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

  const trainer = await registerMember(app, 'trainer', generatePassword())
  write('INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical')
  write('INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'TECH-1', 'TECH', 'MODULE', 'Fire safety orientation')
  write(
    `INSERT INTO training_sessions (id, held_on, starts_at, ends_at, capacity, trainer_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    'ts-picker-1', '2026-03-14', '18:00', '20:00', 10, trainer.id,
  )
  write('INSERT INTO session_modules (id, session_id, module_id) VALUES (?, ?, ?)', 'sm-picker-1', 'ts-picker-1', 'TECH-1')

  const nextWeek = Math.floor(Date.now() / 1000) + 7 * 86_400
  write('INSERT INTO venues (id, name, capacity) VALUES (?, ?, ?)', 'venue-announce', 'The Announce Studio', 60)
  write('INSERT INTO shows (id, slug, title, status) VALUES (?, ?, ?, ?)', 'show-announce', 'evacuation-drill', 'Evacuation Drill', 'PUBLISHED')
  write('INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, ?)',
    'performance-announce', 'show-announce', 'venue-announce', nextWeek, 'ON_SALE')
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

async function signedInView(): Promise<Bun.WebView> {
  forgetSpentStep(app, officer.email)
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', officer.email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)

  const code = await codeForStep(secret, stepFor(new Date()) + 1)
  for (const [index, digit] of [...code].entries()) {
    await fill(view, `[data-test="mfa-challenge"] input:nth-of-type(${index + 1})`, digit)
  }
  await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
  return view
}

describe.skipIf(skip !== null)('the session picker on /comms/announce', () => {
  test('a session is found by what it teaches and shown resolved once chosen', async () => {
    const view = await signedInView()
    await visit(view, `${app.baseURL}/comms/announce`, '[data-test="audience-kind"]')
    await pickOption(view, '[data-test="audience-kind"]', 'A session\'s sign-ups')

    await waitFor(view, `document.querySelector('[data-test="session-picker"]')`)
    await pickPerson(view, '[data-test="session-picker"]', 'fire safety', 'Fire safety orientation')

    const resolved = await textOf(view, '[data-test="session-picker-resolved"]')
    expect(resolved).toContain('Fire safety orientation')
    expect(resolved).toContain('14 Mar 2026')
    view.close()
  }, 120_000)
})

// H-108 criterion 8: a show chosen for one audience does not linger, unseen, behind another.
describe.skipIf(skip !== null)('the show picker on /comms/announce', () => {
  test('a chosen show is dropped when the audience changes, so nothing is counted against it', async () => {
    const view = await signedInView()
    await visit(view, `${app.baseURL}/comms/announce`, '[data-test="audience-kind"]')
    await pickOption(view, '[data-test="audience-kind"]', 'Ticket holders for a show')
    await waitFor(view, `document.querySelector('[data-test="show-picker"]')`)
    await pickPerson(view, '[data-test="show-picker"]', 'evacuation', 'Evacuation Drill')
    await waitFor(view, `!!document.querySelector('[data-test="show-picker-resolved"]')`)
    await waitFor(view, `/will get this|Nobody is in this audience/.test(document.querySelector('[data-test="audience-count"]').innerText)`)

    await pickOption(view, '[data-test="audience-kind"]', 'Tonight\'s rota')
    await pickOption(view, '[data-test="audience-kind"]', 'Ticket holders for a show')
    await waitFor(view, `document.querySelector('[data-test="show-picker"]')`)

    expect(await view.evaluate<boolean>(`!!document.querySelector('[data-test="show-picker-resolved"]')`)).toBe(false)
    await waitFor(view, `/Choose who it is for/.test(document.querySelector('[data-test="audience-count"]').innerText)`)
    view.close()
  }, 120_000)
})

// H-108 criterion 7: the count arrives before anything is written, and the draft survives its
// own send so an officer can see what went.
describe.skipIf(skip !== null)('the count and the draft on /comms/announce', () => {
  test('choosing an audience counts it before a subject is typed', async () => {
    const view = await signedInView()
    await visit(view, `${app.baseURL}/comms/announce`, '[data-test="audience-kind"]')
    await waitFor(view, `!!document.querySelector('[data-test="audience-count"]')`)
    expect(await textOf(view, '[data-test="audience-count"]')).toMatch(/will get this|Nobody is in this audience/)
    view.close()
  }, 120_000)

  test('a sent announcement stays on screen and says it went', async () => {
    const view = await signedInView()
    await visit(view, `${app.baseURL}/comms/announce`, '[data-test="audience-kind"]')
    await fill(view, '[data-test="announce-subject"] input', 'Get-in on Saturday')
    await fill(view, '[data-test="announce-body"]', 'Doors at ten, bring gloves.')

    await click(view, '[data-test="announce-preview"]')
    await waitFor(view, `!!document.querySelector('[data-test="announce-send"]')`)
    await click(view, '[data-test="announce-send"]')

    await waitFor(view, `!!document.querySelector('[data-test="announce-sent"]')`)
    expect(await textOf(view, '[data-test="announce-sent"]')).toMatch(/Sent to|Queued for/)
    expect(await view.evaluate<string>('document.querySelector(\'[data-test="announce-subject"] input\').value'))
      .toBe('Get-in on Saturday')

    await click(view, '[data-test="announce-again"]')
    await waitFor(view, 'document.querySelector(\'[data-test="announce-sent"]\') === null')
    expect(await view.evaluate<string>('document.querySelector(\'[data-test="announce-subject"] input\').value')).toBe('')
    view.close()
  }, 120_000)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
