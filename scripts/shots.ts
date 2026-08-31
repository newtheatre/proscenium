#!/usr/bin/env bun
// Screenshots of every admin screen, for reviewing how they look. Seeds realistic data, signs in,
// and writes a PNG per screen at two widths. Nothing gates on this and CI never runs it (0032).

import { Database } from 'bun:sqlite'
import { click, fill, fillPin, openSignedOutView, startApp, visit, waitFor } from '../tests/helpers/webview'
import { codeForStep, stepFor } from '../shared/utils/totp'
import { londonDay } from '../shared/utils/membership'

// Gitignored: the pictures are for looking at once, not for keeping.
const OUT = process.env.SHOTS_OUT ?? '.shots'
const WIDE = 1400
const NARROW = 900

const password = `shots-${crypto.randomUUID()}`
const email = `shots-${crypto.randomUUID().slice(0, 8)}@e2e.newtheatre.org.uk`

const app = await startApp()

const send = (method: string, path: string, body?: unknown, cookie?: string): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function sql(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

function one<T>(statement: string, ...parameters: unknown[]): T {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query(statement).get(...parameters as never[]) as T
  }
  finally {
    database.close()
  }
}

// The screenshots are taken as an administrator, so this account walks the whole real path:
// register, verify, enrol an authenticator, be granted the role, then answer a challenge.
await send('POST', '/api/auth/register', { email, name: 'Imogen Hart (test)', password })
sql('UPDATE users SET verified = 1 WHERE email = ?', email)
const first = ((await send('POST', '/api/auth/sign-in', { email, password })).headers.get('set-cookie') ?? '').split(';')[0]!
const { secret } = await (await send('POST', '/api/account/mfa/enrol', {}, first)).json() as { secret: string }
await send('POST', '/api/account/mfa/confirm', { code: await codeForStep(secret, stepFor(new Date())) }, first)
Bun.spawnSync(['bun', 'scripts/grant-admin.ts', email, app.databaseFile])

// A code is single use, so a second sign-in in the same 30 second step needs the last one forgotten.
function forgetStep(): void {
  sql('UPDATE totp_secrets SET last_used_step = NULL WHERE user_id = (SELECT id FROM users WHERE email = ?)', email)
}

forgetStep()
const cookie = await (async () => {
  const { attemptId } = await (await send('POST', '/api/auth/sign-in', { email, password })).json() as { attemptId: string }
  const answered = await send('POST', '/api/auth/mfa/challenge', { attemptId, code: await codeForStep(secret, stepFor(new Date())) })
  return (answered.headers.get('set-cookie') ?? '').split(';')[0]!
})()

// Enough real data that no screen is empty: an empty table hides every layout problem there is.
const NAMES = ['Rowan Ellis', 'Priya Nair', 'Tomasz Zielinski', 'Aoife Brennan', 'Sam Okonkwo', 'Hana Suzuki']
const ids: string[] = []
for (const [index, name] of NAMES.entries()) {
  const address = `shots-member-${index}@e2e.newtheatre.org.uk`
  await send('POST', '/api/auth/register', { email: address, name: `${name} (test)`, password })
  sql('UPDATE users SET verified = 1 WHERE email = ?', address)
  ids.push(one<{ id: string }>('SELECT id FROM users WHERE email = ?', address).id)
}

await send('POST', '/api/dev/seed', {}, cookie)
await send('POST', '/api/admin/roles', { userId: ids[0], role: 'BOX_OFFICE' }, cookie)
await send('POST', '/api/admin/roles', { userId: ids[1], role: 'FRONT_OF_HOUSE' }, cookie)
await send('PUT', '/api/admin/config/BAR_TAB_CAP_PENCE', { value: 2500 }, cookie)

const DAY_MS = 24 * 60 * 60 * 1000
for (const [index, id] of ids.slice(0, 4).entries()) {
  await send('POST', '/api/admin/memberships', {
    userId: id,
    startsOn: londonDay(new Date(Date.now() - index * 40 * DAY_MS)),
    years: index % 2 === 0 ? 1 : 3,
    studentId: `2099000${index}`,
  }, cookie)
}
await send('POST', '/api/admin/fellowships', {
  userId: ids[4],
  awardedOn: '2019-06-12',
  awardedBy: 'Committee, 12 June 2019',
  citation: 'For a decade behind the lighting desk, and for teaching most of us to use it.',
}, cookie)
await send('POST', '/api/admin/fellowships', {
  userId: ids[5],
  awardedOn: '2014-11-03',
  awardedBy: 'Committee, 3 November 2014',
  citation: 'For founding the studio season.',
}, cookie)

const view = await openSignedOutView(app.baseURL)
await visit(view, `${app.baseURL}/sign-in`)
await fill(view, 'form input[type="email"]', email)
await fill(view, 'form input[type="password"]', password)
await click(view, 'form button[type="submit"]')
await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)
forgetStep()
await fillPin(view, '[data-test="mfa-challenge"] input', await codeForStep(secret, stepFor(new Date())))
await waitFor(view, `document.querySelector('[data-test="sign-out"]')`)

interface Shot {
  name: string
  path: string
  // Waited for before the picture, so a screen is never caught mid-load.
  marker?: string
  after?: string
  width?: number
}

const OPEN_MEMBERSHIP = `(async () => {
  document.querySelector('[data-test="record-membership"]').click()
  await new Promise(resolve => setTimeout(resolve, 400))
  const input = document.querySelector('[data-test="person-picker"] input')
  input.focus()
  Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, 'ro')
  input.dispatchEvent(new Event('input', { bubbles: true }))
})()`

const SHOTS: Shot[] = [
  { name: '01-overview', path: '/admin', marker: 'h1' },
  { name: '02-people', path: '/admin/people', marker: '[data-test="directory-table"]' },
  { name: '03-people-filters', path: '/admin/people', marker: '[data-test="directory-table"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '04-account', path: `/admin/people/${ids[0]}`, marker: '[data-test="account-name"]' },
  { name: '05-members', path: '/admin/members', marker: '[data-test="members-table"]' },
  { name: '06-members-modal', path: '/admin/members', marker: '[data-test="members-table"]', after: OPEN_MEMBERSHIP },
  { name: '07-fellows', path: '/admin/fellows', marker: '[data-test="fellows-table"]' },
  { name: '08-fellows-modal', path: '/admin/fellows', marker: '[data-test="fellows-table"]', after: `document.querySelector('[data-test="award"]').click()` },
  { name: '09-audit', path: '/admin/audit', marker: '[data-test="audit-table"]' },
  { name: '10-audit-modal', path: '/admin/audit', marker: '[data-test="audit-table"]', after: `document.querySelector('[data-test="audit-record"]').click()` },
  { name: '11-config', path: '/admin/config', marker: '[data-test="setting-BAR_TAB_CAP_PENCE"]' },
  { name: '12-dev-tools', path: '/dev', marker: '[data-test="dev-seed"]' },
  { name: '13-people-narrow', path: '/admin/people', marker: '[data-test="directory-table"]', width: NARROW },
  { name: '14-members-narrow', path: '/admin/members', marker: '[data-test="members-table"]', width: NARROW },
  { name: '15-config-narrow', path: '/admin/config', marker: '[data-test="setting-BAR_TAB_CAP_PENCE"]', width: NARROW },
]

const wanted = process.argv.slice(2)
for (const shot of SHOTS) {
  if (wanted.length && !wanted.some(term => shot.name.includes(term))) continue

  view.resize(shot.width ?? WIDE, 1000)
  await visit(view, `${app.baseURL}${shot.path}`, shot.marker)
  await Bun.sleep(1200)
  if (shot.after) {
    await view.evaluate(shot.after)
    await Bun.sleep(1200)
  }
  await Bun.write(`${OUT}/${shot.name}.png`, await view.screenshot())
  console.info(`wrote ${OUT}/${shot.name}.png`)
}

view.close()
await app.stop()

// Explicit: the dev server subprocess keeps the loop alive, so the run would otherwise sit there
// holding the port. The exit handler in the harness is what kills it.
process.exit(0)
