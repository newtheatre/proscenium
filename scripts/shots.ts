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
// A room of each kind, so the screen is not judged on an empty table.
for (const [name, over] of [
  ['The Studio', { capacity: 40 }],
  ['The Auditorium', { capacity: 120, sensitive: true, hours: [{ weekday: 1, opens: '09:00', closes: '22:00' }] }],
] as [string, Record<string, unknown>][]) {
  await send('POST', '/api/admin/rooms', { name, ...over }, cookie)
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

// Booking a room needs a current membership (C-105 criterion 2), and an officer is not exempt.
sql(`INSERT INTO memberships (id, user_id, starts_on, expires_on, source)
     VALUES (?, (SELECT id FROM users WHERE email = ?), date('now', '-30 days'), date('now', '+300 days'), 'MANUAL')`,
crypto.randomUUID().replaceAll('-', ''), email)

// A venue, a show and two performances tonight, staffed and claimed enough that the rota
// console lists (K-129) are never a picture of an empty table.
sql(`INSERT INTO venues (id, name, capacity, room_id) VALUES (?, ?, ?, NULL)`, 'shots-venue', 'The Space (test)', 80)
sql(`INSERT INTO shows (id, slug, title, status) VALUES (?, ?, ?, ?)`, 'shots-show', 'shots-the-seagull', 'The Seagull (test)', 'PUBLISHED')
sql(`INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)`, crypto.randomUUID(), 'shots-venue', 'DUTY_MANAGER', 1)
sql(`INSERT INTO shift_templates (id, venue_id, role, "count") VALUES (?, ?, ?, ?)`, crypto.randomUUID(), 'shots-venue', 'DOOR', 2)
const shotsNow = Math.floor(Date.now() / 1000)
sql(`INSERT INTO performances (id, show_id, venue_id, starts_at, doors_at, duration_minutes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
'shots-performance', 'shots-show', 'shots-venue', shotsNow + 4 * 3600, shotsNow + 3.5 * 3600, 120, 'ON_SALE')
sql(`INSERT INTO shifts (id, performance_id, role, slot, status) VALUES (?, ?, ?, ?, ?)`,
  'shots-shift-open', 'shots-performance', 'DOOR', 1, 'OPEN')
sql(`INSERT INTO shifts (id, performance_id, role, slot, status, user_id, claimed_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())`,
  'shots-shift-claimed', 'shots-performance', 'DOOR', 2, 'CLAIMED', ids[2])
sql(`INSERT INTO venue_emergency_info (id, venue_id, assembly_point, updated_by) VALUES (?, ?, ?, (SELECT id FROM users WHERE email = ?))`,
  crypto.randomUUID(), 'shots-venue', 'The car park behind the building', email)
sql(`INSERT INTO checklist_items (id, venue_id, phase, label, sort, required) VALUES (?, ?, ?, ?, ?, ?)`,
  crypto.randomUUID(), 'shots-venue', 'PRE', 'Fire exits checked', 1, 1)

const roomsForShots = await (await send('GET', '/api/admin/rooms', undefined, cookie)).json() as { items: { id: string, name: string }[] }
const studio = roomsForShots.items.find(room => room.name === 'The Studio') ?? roomsForShots.items[0]
if (studio) {
  // Beyond the notice window, or the policy refuses it as short notice and the picture is empty.
  const soon = new Date()
  soon.setDate(soon.getDate() + 4)
  soon.setHours(18, 0, 0, 0)
  await send('POST', '/api/rooms/bookings', {
    roomId: studio.id,
    title: 'Read-through, The Seagull',
    purpose: 'REHEARSAL',
    startsAt: soon.toISOString(),
    endsAt: new Date(soon.getTime() + 2 * 3_600_000).toISOString(),
  }, cookie)
}

// Inside the notice window, so the policy refuses it and it becomes a request: the queue with
// nothing waiting in it is not a picture of the queue.
if (studio) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(19, 0, 0, 0)
  await send('POST', '/api/rooms/requests', {
    roomId: studio.id,
    title: 'Tech run, The Seagull',
    purpose: 'REHEARSAL',
    startsAt: tomorrow.toISOString(),
    endsAt: new Date(tomorrow.getTime() + 3 * 3_600_000).toISOString(),
    reason: 'The get-in moved to Friday, so the tech has to be tomorrow.',
  }, cookie)
}

// Enough that the bar's console lists are not empty tables either.
const barCategory = await (await send('POST', '/api/admin/bar/categories', { name: 'Wine', sort: 10 }, cookie)).json() as { id: string }
await send('POST', '/api/admin/bar/products', { name: 'House red', categoryId: barCategory.id }, cookie)
const barItem = await (await send('POST', '/api/admin/bar/items', { name: 'House red 750ml', unit: 'ML', containerMl: 750 }, cookie)).json() as { id: string }
await send('POST', '/api/admin/bar/movements', { itemId: barItem.id, kind: 'DELIVERY', qty: 4500, unitCostPence: 480 }, cookie)
await send('POST', '/api/admin/bar/stocktakes', undefined, cookie)

const view = await openSignedOutView(app.baseURL)
await visit(view, `${app.baseURL}/sign-in`)
await fill(view, 'form input[type="email"]', email)
await fill(view, 'form input[type="password"]', password)
await click(view, 'form button[type="submit"]')
await waitFor(view, `document.querySelectorAll('[data-test="mfa-challenge"] input').length >= 6`)
forgetStep()
await fillPin(view, '[data-test="mfa-challenge"] input', await codeForStep(secret, stepFor(new Date())))
await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

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
  { name: '09a-audit-filters', path: '/admin/audit', marker: '[data-test="audit-table"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '10-audit-modal', path: '/admin/audit', marker: '[data-test="audit-table"]', after: `document.querySelector('[data-test="audit-record"]').click()` },
  { name: '10c-backups', path: '/admin/backups', marker: '[data-test="drills-table"]' },
  { name: '10d-comms-operations', path: '/comms/operations', marker: '[data-test="send-log-table"]' },
  { name: '09a-calendar-week', path: '/rooms', marker: '[data-test="calendar-span"]' },
  { name: '09b-calendar-day', path: '/rooms', marker: '[data-test="calendar-span"]', after: `document.querySelector('[data-test="calendar-day"]').click()` },
  { name: '09c-home', path: '/', marker: 'main' },
  { name: '10a-rooms', path: '/rooms/manage', marker: '[data-test="rooms-table"]' },
  { name: '10b-rooms-modal', path: '/rooms/manage', marker: '[data-test="rooms-table"]', after: `(async () => {
    document.querySelector('[data-test="add-room"]').click()
    await new Promise(resolve => setTimeout(resolve, 500))
    for (const section of ['hours-section', 'policy-section']) {
      document.querySelector('[data-test="' + section + '"] button')?.click()
    }
  })()` },
  { name: '10c-rooms-filters', path: '/rooms/manage', marker: '[data-test="rooms-table"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '10d-requests', path: '/rooms/manage/requests', marker: '[data-test="requests-table"]' },
  { name: '10d1-shows', path: '/box-office/shows', marker: '[data-test="shows-table"]' },
  { name: '10d2-shows-filters', path: '/box-office/shows?status=is:DRAFT', marker: '[data-test="toolbar-active"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '10e-other-rooms', path: '/rooms/manage/other', marker: '[data-test="spaces-table"]' },
  { name: '10e1-other-rooms-filters', path: '/rooms/manage/other', marker: '[data-test="spaces-table"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '10f-requests-unlisted', path: '/rooms/manage/requests?kind=unlisted', marker: '[data-test="requests-table"]' },
  { name: '10f1-requests-filters', path: '/rooms/manage/requests', marker: '[data-test="requests-table"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '10f2-closures', path: '/rooms/manage/closures', marker: '[data-test="blackouts-table"]' },
  { name: '10f3-closures-filters', path: '/rooms/manage/closures', marker: '[data-test="blackouts-table"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '10f4-utilisation', path: '/rooms/manage/utilisation', marker: '[data-test="utilisation-table"]' },
  { name: '10f5-utilisation-filters', path: '/rooms/manage/utilisation', marker: '[data-test="utilisation-table"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '10g-bar-categories', path: '/bar/categories', marker: '[data-test="bar-categories-table"]' },
  { name: '10h-bar-products', path: '/bar/products', marker: '[data-test="bar-products-table"]' },
  { name: '10i-bar-products-filters', path: '/bar/products', marker: '[data-test="bar-products-table"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '10j-bar-stock', path: '/bar/stock', marker: '[data-test="bar-items-table"]' },
  { name: '10k-bar-movements', path: '/bar/stock/movements', marker: '[data-test="bar-movements-table"]' },
  { name: '10l-bar-stocktakes', path: '/bar/stock/stocktakes', marker: '[data-test="bar-stocktakes-table"]' },
  { name: '16a-rota-shifts', path: '/rota/manage/shifts', marker: '[data-test="unfilled-shifts-table"]' },
  { name: '16b-rota-shifts-filters', path: '/rota/manage/shifts', marker: '[data-test="unfilled-shifts-table"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '16c-rota-approvals', path: '/rota/manage/approvals', marker: '[data-test="approvals-table"]' },
  { name: '16d-rota-templates', path: '/rota/manage/templates', marker: '[data-test="templates-table"]' },
  { name: '16e-rota-templates-filters', path: '/rota/manage/templates', marker: '[data-test="templates-table"]', after: `document.querySelector('[data-test="toolbar-filters"]').click()` },
  { name: '16f-rota-checklists', path: '/rota/manage/checklists', marker: '[data-test="checklists-table"]' },
  { name: '16g-rota-emergency', path: '/rota/manage/emergency', marker: '[data-test="emergency-table"]' },
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
