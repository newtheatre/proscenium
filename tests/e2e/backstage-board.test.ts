import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
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
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)

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
  test('the six named milestone types are already there', async () => {
    const listed = await send('GET', '/api/admin/backstage/milestone-types', undefined, foh.cookie)
    expect(listed.status).toBe(200)
    const { types } = await listed.json() as { types: { label: string }[] }
    expect(types.map(type => type.label)).toEqual(['Clearance', 'House open', 'Curtain up', 'Interval', 'Restart', 'End'])
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

  test('front of house sends free text but never a milestone', async () => {
    const composedAt = Math.floor(Date.now() / 1000)
    expect((await send('POST', '/api/tonight/board/messages', { body: 'Two minutes on the bar queue', composedAt }, foh.cookie)).status).toBe(200)

    const types = await send('GET', '/api/admin/backstage/milestone-types', undefined, foh.cookie)
    const { types: milestones } = await types.json() as { types: { id: string }[] }
    expect((await send('POST', '/api/tonight/board/messages', { milestoneTypeId: milestones[0]!.id, composedAt }, foh.cookie)).status).toBe(400)
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
})

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
    const composedAt = Math.floor(Date.now() / 1000)
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
