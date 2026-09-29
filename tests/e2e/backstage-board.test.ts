import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, grantRole, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { LAST_NIGHTS_BOARD } from '#shared/utils/backstage'
import { daysAfter } from '#shared/utils/membership'
import { currentShowNight } from '#shared/utils/show-night'
import { click, fill, openView, signInView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-121's messages, presets, milestones and acknowledgements, and E-122's reset and retention,
// through the real routes. `tests/integration/backstage.test.ts` pins the statement builders.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  foh = await registerMember(app, 'board-foh', generatePassword())
  await grantRole(app, foh, 'FOH_MANAGER', admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    tonightsPerformance(sqliteTarget(database), { suffix: 'board-house' })
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
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

async function joinAs(label: string): Promise<{ deviceCookie: string, token: string }> {
  const { code } = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }
  const joined = await request(app, 'POST', '/api/board/join', { code, label })
  const { token } = await joined.json() as { token: string }
  return { deviceCookie: `nnt-backstage-token=${token}`, token }
}

describe.skipIf(skip !== null)('milestone types and presets, committee configuration (E-121 criteria 1, 2)', () => {
  // Issue 1313 adds front of house's Ready to restart beside the six the story named.
  test('the named milestone types are already there', async () => {
    const listed = await send('GET', '/api/admin/backstage/milestone-types', undefined, foh.cookie)
    expect(listed.status).toBe(200)
    const { types } = await listed.json() as { types: { label: string }[] }
    expect(types.map(type => type.label)).toEqual(['Clearance', 'House open', 'Curtain up', 'Interval', 'Ready to restart', 'Restart', 'End'])
  })

  test('the FOH officer can add, edit and retire a preset', async () => {
    const created = await send('POST', '/api/admin/backstage/presets', { label: '5 minutes', body: 'Five minutes please', sort: 0 }, foh.cookie)
    expect(created.status).toBe(200)
    const { id } = await created.json() as { id: string }

    const edited = await send('PUT', `/api/admin/backstage/presets/${id}`, { label: '5 mins', body: 'Five minutes please', sort: 0 }, foh.cookie)
    expect(edited.status).toBe(200)

    const retired = await send('POST', `/api/admin/backstage/presets/${id}/status`, { active: false }, foh.cookie)
    expect(retired.status).toBe(200)

    const listed = await send('GET', '/api/admin/backstage/presets', undefined, foh.cookie)
    const { presets } = await listed.json() as { presets: { id: string, active: boolean }[] }
    expect(presets.find(preset => preset.id === id)).toMatchObject({ active: false })
  })

  test('an ordinary member cannot configure either', async () => {
    const member = await registerMember(app, 'board-nobody', generatePassword())
    expect((await send('GET', '/api/admin/backstage/milestone-types', undefined, member.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/backstage/presets', { label: 'x', body: 'y', sort: 0 }, member.cookie)).status).toBe(403)
  })
})

describe.skipIf(skip !== null)('posting and reading messages (E-121 criteria 1, 2, 3, 4)', () => {
  test('a joined device reads the active config and posts a milestone', async () => {
    const { deviceCookie } = await joinAs('Stage left')

    const config = await request(app, 'GET', '/api/board/config', undefined, deviceCookie)
    expect(config.status).toBe(200)
    const { milestoneTypes } = await config.json() as { milestoneTypes: { id: string, label: string }[] }
    const clearance = milestoneTypes.find(type => type.label === 'Clearance')!

    const posted = await request(app, 'POST', '/api/board/messages', { milestoneTypeId: clearance.id, composedAt: Math.floor(Date.now() / 1000) }, deviceCookie)
    expect(posted.status).toBe(200)

    const listed = await request(app, 'GET', '/api/board/messages', undefined, deviceCookie)
    const { messages } = await listed.json() as { messages: { milestoneLabel: string | null }[] }
    expect(messages.some(message => message.milestoneLabel === 'Clearance')).toBe(true)
  })

  test('the duty manager reads the same feed, authenticated rather than by device', async () => {
    const read1 = await send('GET', '/api/tonight/board/messages', undefined, foh.cookie)
    expect(read1.status).toBe(200)
    const { messages } = await read1.json() as { messages: unknown[] }
    expect(messages.length).toBeGreaterThan(0)
  })

  test('free text over the limit is refused before it is written', async () => {
    const { deviceCookie } = await joinAs('Stage right')
    const answered = await request(app, 'POST', '/api/board/messages', { body: 'x'.repeat(501), composedAt: Math.floor(Date.now() / 1000) }, deviceCookie)
    expect(answered.status).toBe(400)
  })

  test('a caller with no device cookie is refused', async () => {
    expect((await request(app, 'GET', '/api/board/messages')).status).toBe(401)
  })

  test('a message posted writes an audit entry naming no actor', async () => {
    const { deviceCookie } = await joinAs('Prompt corner')
    await request(app, 'POST', '/api/board/messages', { body: 'Testing', composedAt: Math.floor(Date.now() / 1000) }, deviceCookie)

    const entry = read<{ actor_id: string | null }>(`SELECT actor_id FROM audit_log WHERE action = 'board.message-posted' ORDER BY created_at DESC LIMIT 1`)
    expect(entry?.actor_id).toBeNull()
  })
})

describe.skipIf(skip !== null)('correcting a milestone (criterion 5)', () => {
  test('a mistaken milestone is corrected, and the correction is what shows', async () => {
    const { deviceCookie } = await joinAs('DSM')
    const { milestoneTypes } = await (await request(app, 'GET', '/api/board/config', undefined, deviceCookie)).json() as { milestoneTypes: { id: string, label: string }[] }
    const interval = milestoneTypes.find(type => type.label === 'Interval')!
    const restart = milestoneTypes.find(type => type.label === 'Restart')!

    const posted = await request(app, 'POST', '/api/board/messages', { milestoneTypeId: interval.id, composedAt: Math.floor(Date.now() / 1000) }, deviceCookie)
    const { id } = await posted.json() as { id: string }

    const corrected = await request(app, 'POST', `/api/board/messages/${id}/supersede`, { milestoneTypeId: restart.id, composedAt: Math.floor(Date.now() / 1000) }, deviceCookie)
    expect(corrected.status).toBe(200)

    const second = await request(app, 'POST', `/api/board/messages/${id}/supersede`, { milestoneTypeId: restart.id, composedAt: Math.floor(Date.now() / 1000) }, deviceCookie)
    expect(second.status).toBe(409)
  })
})

describe.skipIf(skip !== null)('acknowledging a message (criterion 4)', () => {
  test('a device can acknowledge, and a repeat changes nothing', async () => {
    const { deviceCookie } = await joinAs('Wings')
    const posted = await request(app, 'POST', '/api/board/messages', { body: 'Ready?', composedAt: Math.floor(Date.now() / 1000) }, deviceCookie)
    const { id } = await posted.json() as { id: string }

    expect((await request(app, 'POST', `/api/board/messages/${id}/acknowledge`, undefined, deviceCookie)).status).toBe(200)
    expect((await request(app, 'POST', `/api/board/messages/${id}/acknowledge`, undefined, deviceCookie)).status).toBe(200)

    const listed = await request(app, 'GET', '/api/board/messages', undefined, deviceCookie)
    const { acknowledgements } = await listed.json() as { acknowledgements: { messageId: string }[] }
    expect(acknowledgements.filter(ack => ack.messageId === id)).toHaveLength(1)
  })
})

describe.skipIf(skip !== null)('resetting the board (E-122 criteria 1, 2, 3)', () => {
  test('every device is disconnected and the code changes', async () => {
    const { deviceCookie } = await joinAs('About to be kicked')
    const before = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }

    const reset = await send('POST', '/api/tonight/board/reset', undefined, foh.cookie)
    expect(reset.status).toBe(200)

    const after = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }
    expect(after.code).not.toBe(before.code)

    const refused = await request(app, 'GET', '/api/board/messages', undefined, deviceCookie)
    expect(refused.status).toBe(401)
  })

  test('an ordinary member cannot reset', async () => {
    const member = await registerMember(app, 'board-reset-nobody', generatePassword())
    expect((await send('POST', '/api/tonight/board/reset', undefined, member.cookie)).status).toBe(403)
  })

  test('a reset is logged with the actor', async () => {
    await send('POST', '/api/tonight/board/reset', undefined, foh.cookie)
    const entry = read<{ actor_id: string }>(`SELECT actor_id FROM audit_log WHERE action = 'board.reset' ORDER BY created_at DESC LIMIT 1`)
    expect(entry?.actor_id).toBe(foh.id)
  })

  test('a device joining after the reset works normally', async () => {
    const { deviceCookie } = await joinAs('Rejoined')
    expect((await request(app, 'GET', '/api/board/messages', undefined, deviceCookie)).status).toBe(200)
  })
})

describe.skipIf(skip !== null)('front of house holds the other end of the board (E-121 criterion 7)', () => {
  test('the duty manager sends a preset, and it reads as FOH with the crew\'s presets beside it', async () => {
    const created = await send('POST', '/api/admin/backstage/presets', { label: 'Hold', body: 'Hold the house', sort: 1 }, foh.cookie)
    const { id } = await created.json() as { id: string }

    const sent = await send('POST', '/api/tonight/board/messages', { presetId: id, composedAt: Math.floor(Date.now() / 1000) }, foh.cookie)
    expect(sent.status).toBe(200)

    const read1 = await send('GET', '/api/tonight/board/messages', undefined, foh.cookie)
    const answered = await read1.json() as { messages: { id: string, side: string, body: string }[], presets: { id: string }[] }
    const posted = answered.messages.find(message => message.body === 'Hold the house')
    expect(posted?.side).toBe('FOH')
    expect(answered.presets.some(preset => preset.id === id)).toBe(true)
  })

  // Issue 1313: front of house calls its own milestones, and never the wings'.
  test('front of house sends free text and its own milestones, never the wings\'', async () => {
    const composedAt = Math.floor(Date.now() / 1000)
    expect((await send('POST', '/api/tonight/board/messages', { body: 'Two minutes on the bar queue', composedAt }, foh.cookie)).status).toBe(200)

    const types = await send('GET', '/api/admin/backstage/milestone-types', undefined, foh.cookie)
    const { types: milestones } = await types.json() as { types: { id: string, label: string, side: string }[] }
    const wings = milestones.find(type => type.side === 'BACKSTAGE')!
    const foyer = milestones.find(type => type.label === 'House open')!
    expect((await send('POST', '/api/tonight/board/messages', { milestoneTypeId: wings.id, composedAt }, foh.cookie)).status).toBe(400)
    expect((await send('POST', '/api/tonight/board/messages', { milestoneTypeId: foyer.id, composedAt }, foh.cookie)).status).toBe(200)
  })

  test('a crew tick marks an FOH call seen, and front of house ticks a call from the wings', async () => {
    const { deviceCookie } = await joinAs('Prompt desk')
    const composedAt = Math.floor(Date.now() / 1000)

    await send('POST', '/api/tonight/board/messages', { body: 'House open in five', composedAt }, foh.cookie)
    await request(app, 'POST', '/api/board/messages', { body: 'Standing by', composedAt }, deviceCookie)

    const read1 = await send('GET', '/api/tonight/board/messages', undefined, foh.cookie)
    const before = await read1.json() as { messages: { id: string, body: string }[], seen: { messageId: string }[] }
    const mine = before.messages.find(message => message.body === 'House open in five')!
    const theirs = before.messages.find(message => message.body === 'Standing by')!
    expect(before.seen.some(row => row.messageId === mine.id)).toBe(false)

    await request(app, 'POST', `/api/board/messages/${mine.id}/acknowledge`, undefined, deviceCookie)
    expect((await send('POST', '/api/tonight/board/seen', { messageId: theirs.id }, foh.cookie)).status).toBe(200)

    const read2 = await send('GET', '/api/tonight/board/messages', undefined, foh.cookie)
    const after = await read2.json() as { seen: { messageId: string }[] }
    expect(after.seen.map(row => row.messageId).sort()).toEqual([mine.id, theirs.id].sort())
  })

  test('an ordinary member holds neither end', async () => {
    const member = await registerMember(app, 'board-outsider', generatePassword())
    const composedAt = Math.floor(Date.now() / 1000)
    expect((await send('POST', '/api/tonight/board/messages', { body: 'Nope', composedAt }, member.cookie)).status).toBe(403)
    expect((await send('POST', '/api/tonight/board/seen', { messageId: 'whatever' }, member.cookie)).status).toBe(403)
  })

  // Issue 1313: front of house changes its own milestone once, never the wings', and nobody else can.
  test('front of house changes its own milestone once, never the wings\', under shift authority', async () => {
    const composedAt = Math.floor(Date.now() / 1000)
    const { types } = await (await send('GET', '/api/admin/backstage/milestone-types', undefined, foh.cookie)).json() as { types: { id: string, label: string }[] }
    const byLabel = (label: string): string => types.find(type => type.label === label)!.id

    const posted = await send('POST', '/api/tonight/board/messages', { milestoneTypeId: byLabel('House open'), composedAt }, foh.cookie)
    const { id } = await posted.json() as { id: string }
    const change = (entryId: string, label: string, as = foh.cookie): Promise<Response> =>
      send('POST', `/api/tonight/board/messages/${entryId}/supersede`, { milestoneTypeId: byLabel(label), composedAt: composedAt + 10 }, as)

    const member = await registerMember(app, 'board-change-outsider', generatePassword())
    expect((await change(id, 'Ready to restart', member.cookie)).status).toBe(403)
    expect((await change(id, 'Ready to restart')).status).toBe(200)
    expect((await change(id, 'Ready to restart')).status).toBe(409)

    const { deviceCookie } = await joinAs('Stage manager')
    const wings = await request(app, 'POST', '/api/board/messages', { milestoneTypeId: byLabel('Clearance'), composedAt }, deviceCookie)
    const { id: wingsId } = await wings.json() as { id: string }
    expect((await change(wingsId, 'House open')).status).toBe(409)
  })
})

// The current state is the latest call by its sender's clock, and an earlier case dates a
// correction ahead, so a call a case means to lead with is composed after every one on the board.
function laterThanEveryCall(): number {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const latest = database.query('SELECT max(composed_at) AS at FROM backstage_messages').get() as { at: number | null }
    return Math.max(Math.floor(Date.now() / 1000), (latest.at ?? 0) + 1)
  }
  finally {
    database.close()
  }
}

// Both ends read the board the same way (criterion 7, amended 14 September 2026): the crew's
// feed carries front of house's ticks, and the joined screen leads with the current state.
describe.skipIf(skip !== null)('the wings read the board the way front of house does (E-121 criterion 7)', () => {
  test('the crew feed carries which of their calls front of house has seen, and the device\'s own id', async () => {
    const { deviceCookie } = await joinAs('Fly floor')
    const composedAt = Math.floor(Date.now() / 1000)
    const posted = await request(app, 'POST', '/api/board/messages', { body: 'Flys standing by', composedAt }, deviceCookie)
    const { id } = await posted.json() as { id: string }

    const before = await (await request(app, 'GET', '/api/board/messages', undefined, deviceCookie)).json() as { seen: { messageId: string }[], deviceId: string }
    expect(before.seen.some(row => row.messageId === id)).toBe(false)
    expect(typeof before.deviceId).toBe('string')

    expect((await send('POST', '/api/tonight/board/seen', { messageId: id }, foh.cookie)).status).toBe(200)

    const after = await (await request(app, 'GET', '/api/board/messages', undefined, deviceCookie)).json() as { seen: { messageId: string, seenAt: number }[] }
    expect(after.seen.find(row => row.messageId === id)?.seenAt).toBeGreaterThan(0)
  })

  test('the joined screen leads with the current state, and ticks a call once front of house has seen it', async () => {
    const composedAt = laterThanEveryCall()
    const called = await send('POST', '/api/tonight/board/messages', { body: 'Places in five', composedAt }, foh.cookie)
    const { id: fohId } = await called.json() as { id: string }
    const { code } = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }

    const view = await openView()
    try {
      await visit(view, `${app.baseURL}/board`, '[data-test="board-join-form"]')
      await fill(view, '[data-test="board-code-input"]', code)
      await fill(view, '[data-test="board-label-input"]', 'Prompt desk screen')
      await click(view, '[data-test="board-join-submit"]')
      await waitFor(view, `document.querySelector('[data-test="board-joined"]')`, 30_000)

      // Front of house's last call, waiting for this device's own tick.
      await waitFor(view, `document.querySelector('[data-test="board-current"]')?.innerText.includes('Places in five')`, 30_000)
      await waitFor(view, `document.querySelector('[data-test="acknowledge-current-${fohId}"]')`, 15_000)

      // This device ticks it, and the tick reaches both the current state and the history row.
      await click(view, `[data-test="acknowledge-${fohId}"]`)
      await waitFor(view, `document.querySelector('[data-test="board-message-${fohId}"]')?.innerText.includes(${JSON.stringify('✓')})`, 30_000)
      await waitFor(view, `!document.querySelector('[data-test="acknowledge-${fohId}"]')`, 15_000)

      // The crew's own call, then front of house marking it seen, then the tick appearing here.
      await fill(view, '[data-test="free-text-input"]', 'Standing by on the book')
      await click(view, '[data-test="free-text-submit"]')
      await waitFor(view, `document.querySelector('[data-test="board-current"]')?.innerText.includes('Standing by on the book')`, 30_000)
      await waitFor(view, `document.querySelector('[data-test="board-current"]')?.innerText.includes('not seen yet')`, 15_000)

      const listed = await (await send('GET', '/api/tonight/board/messages', undefined, foh.cookie)).json() as { messages: { id: string, body: string }[] }
      const theirs = listed.messages.find(message => message.body === 'Standing by on the book')!
      expect((await send('POST', '/api/tonight/board/seen', { messageId: theirs.id }, foh.cookie)).status).toBe(200)

      await waitFor(view, `document.querySelector('[data-test="board-current"]')?.innerText.includes('seen by FOH')`, 30_000)
      await waitFor(view, `document.querySelector('[data-test="board-message-${theirs.id}"]')?.innerText.includes(${JSON.stringify('✓')})`, 30_000)
    }
    finally {
      view.close()
    }
  }, 120_000)
})

// Issue 1520: both ends read the board in a column a phone wide at any window, so at a desk the
// two ends stack as they do on a phone, rather than splitting a phone's width in two.
describe.skipIf(skip !== null)('the current state fits the column it is given (issue 1520)', () => {
  const FOH_CALL = 'Front of house clear for a while yet'
  const WINGS_CALL = 'Standing by for the second half beginners'
  const BOTH_CALLS = `['${FOH_CALL}', '${WINGS_CALL}'].every(call => document.querySelector('[data-test="board-current"]')?.innerText.includes(call))`
  // The reading end's own call first, the other end's second.
  const ENDS = `[...document.querySelector('[data-test="board-current"]').children].map(end => { const box = end.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom } })`

  interface Box { left: number, right: number, top: number, bottom: number }

  const stacked = ([own, other]: Box[]): void => {
    expect(other!.top).toBeGreaterThanOrEqual(own!.bottom)
    expect(other!.right - other!.left).toBeGreaterThanOrEqual(own!.right - own!.left)
  }

  test('at a desk, the duty manager and the wings both read the two ends stacked', async () => {
    const password = generatePassword()
    const manager = await registerMember(app, 'board-desk-dm', password)
    const database = new Database(app.databaseFile)
    try {
      database.query('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, ?, 1, ?, ?)')
        .run('board-desk-dm-shift', 'performance-board-house', 'DUTY_MANAGER', manager.id, 'CONFIRMED')
    }
    finally {
      database.close()
    }
    const composedAt = laterThanEveryCall()
    expect((await send('POST', '/api/tonight/board/messages', { body: FOH_CALL, composedAt }, foh.cookie)).status).toBe(200)
    const { deviceCookie } = await joinAs('Stage left desk')
    expect((await request(app, 'POST', '/api/board/messages', { body: WINGS_CALL, composedAt }, deviceCookie)).status).toBe(200)
    const { code } = await (await send('GET', '/api/tonight/board/code', undefined, foh.cookie)).json() as { code: string }

    const wings = await openView({ width: 1280, height: 800 })
    try {
      // The browser is shared, and an earlier case's joined device reopens its board with no
      // form, so the join happens only when the form is what arrives.
      await wings.navigate(`${app.baseURL}/board`)
      await waitFor(wings, `document.querySelector('[data-test="board-join-form"]') || document.querySelector('[data-test="board-current"]')`, 60_000)
      if (await wings.evaluate<boolean>(`Boolean(document.querySelector('[data-test="board-join-form"]'))`)) {
        await visit(wings, `${app.baseURL}/board`, '[data-test="board-join-form"]')
        await fill(wings, '[data-test="board-code-input"]', code)
        await fill(wings, '[data-test="board-label-input"]', 'Wide wings screen')
        await click(wings, '[data-test="board-join-submit"]')
      }
      await waitFor(wings, BOTH_CALLS, 30_000)
      stacked(await wings.evaluate<Box[]>(ENDS))
    }
    finally {
      wings.close()
    }

    const desk = await signInView(app, manager.email, password, { width: 1280, height: 800 })
    try {
      await visit(desk, `${app.baseURL}/tonight/board`, '[data-test="board-current"]')
      await waitFor(desk, BOTH_CALLS, 30_000)
      stacked(await desk.evaluate<Box[]>(ENDS))
    }
    finally {
      desk.close()
    }
  }, 120_000)
})

// Issue 1313: a phone whose cookie still works reopens its board, and each end sends only its own.
describe.skipIf(skip !== null)('a joined phone and the ends of the board (issue 1313)', () => {
  test('the board a cookie opens names its venue, so a reload needs no second join', async () => {
    const { deviceCookie } = await joinAs('Deputy stage manager')
    const read = await request(app, 'GET', '/api/board/messages', undefined, deviceCookie)
    expect(read.status).toBe(200)
    expect((await read.json() as { venueName: string | null }).venueName).toBeTruthy()
  })

  test('the wings are offered none of the foyer\'s calls, and cannot send one', async () => {
    const { deviceCookie } = await joinAs('Lighting')
    const config = await (await request(app, 'GET', '/api/board/config', undefined, deviceCookie)).json() as { milestoneTypes: { label: string }[] }
    expect(config.milestoneTypes.some(type => type.label === 'House open')).toBe(false)

    const { types } = await (await send('GET', '/api/admin/backstage/milestone-types')).json() as { types: { id: string, label: string }[] }
    const houseOpen = types.find(type => type.label === 'House open')!
    const refused = await request(app, 'POST', '/api/board/messages', { milestoneTypeId: houseOpen.id, composedAt: Math.floor(Date.now() / 1000) }, deviceCookie)
    expect(refused.status).toBe(400)
  })
})

// Issue 1312: a phone joined before 04:00 belongs to that night, so once 04:00 passes it is
// refused and told to join tonight's board. Last, because it moves the venue's night row.
describe.skipIf(skip !== null)('a device from last night (issue 1312)', () => {
  test('works on its own night, and is refused with the reason once that night is over', async () => {
    const label = 'Flys, last night'
    const { deviceCookie } = await joinAs(label)
    expect((await request(app, 'GET', '/api/board/config', undefined, deviceCookie)).status).toBe(200)

    // What 04:00 does to a device: the night it joined becomes last night.
    const database = new Database(app.databaseFile)
    try {
      database.query('UPDATE backstage_nights SET night = ? WHERE id = (SELECT night_id FROM backstage_devices WHERE label = ?)')
        .run(daysAfter(currentShowNight(), -1), label)
    }
    finally {
      database.close()
    }

    const asks: [string, string, unknown][] = [
      ['GET', '/api/board/config', undefined],
      ['GET', '/api/board/messages', undefined],
      ['POST', '/api/board/messages', { body: 'Still here?', composedAt: Math.floor(Date.now() / 1000) }],
    ]
    for (const [method, path, body] of asks) {
      const refused = await request(app, method, path, body, deviceCookie)
      expect(refused.status).toBe(401)
      expect((await refused.json() as { statusMessage: string }).statusMessage).toBe(LAST_NIGHTS_BOARD)
    }
  })
})
