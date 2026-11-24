// C-70: one private feed per person with everything they are on. calendar-feed-merge (CF3, CF6),
// calendar-feed-token (CF1, CF2) and calendar-feed-foh-carryover (CF5) from the test plan.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { linkTokens, setClock } from '#kit'
import { erasurePlan } from '../../../core/server/identity/erasure'
import { call, inContext, rows, setModule } from '../../../../tests/integration/helpers'
import { broken, feedCalls } from '../../../../tests/fixtures/modules/rehearse/server/contributions/core.calendar-feed/calls'
import { duty, handle, performance, ready, req, setting, shift, volunteer, type Person } from '../../../front-of-house/tests/integration/stage'

const HOUR = 3_600_000

beforeAll(async () => {
  await ready()
  await setModule('rehearse', true)
})
afterAll(() => setModule('rehearse', false))
afterEach(() => {
  feedCalls.clear()
  broken.failing = false
  setClock(undefined)
})

/** A volunteer on one published shift, and their feed address. */
async function onAShift(): Promise<{ eve: Person, address: string }> {
  const p = await performance()
  const id = await shift(p.id, await duty('Steward'), 2)
  const eve = volunteer()
  expect((await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, eve)).status).toBe(200)
  const address = (await req('POST', '/api/calendar-feed/me', {}, eve)).body.url as string
  feedCalls.set(eve.accountId!, [{ key: 'call-1', startsAt: p.startsAt - 48 * HOUR, endsAt: p.startsAt - 45 * HOUR, title: 'Read-through', location: 'Studio', status: 'confirmed' }])
  return { eve, address }
}

const fetchFeed = (address: string) => call(handle, 'GET', new URL(address).pathname)

describe('calendar-feed-merge', () => {
  it('puts every contributor\'s events in one feed, each UID ending in the site marker', async () => {
    const { address } = await onAShift()
    const text = await (await fetchFeed(address)).text()
    expect(text).toContain('SUMMARY:Read-through')
    expect(text).toMatch(/SUMMARY:Steward \d+\\, Front of house show/)
    const uids = [...text.matchAll(/^UID:(.+)$/gm)].map(m => m[1]!.trim())
    expect(uids).toHaveLength(2)
    expect(uids).toContain('rehearse.calls.call-1@theatre.example')
    for (const uid of uids) expect(uid.endsWith('@theatre.example')).toBe(true)
  })

  it('keeps the marker it first had when the site moves to another domain', async () => {
    const { address } = await onAShift()
    await setting('core.site.origin', 'https://elsewhere.example')
    try {
      const text = await (await fetchFeed(address.replace('theatre.example', 'elsewhere.example'))).text()
      expect(text).toContain('UID:rehearse.calls.call-1@theatre.example')
    }
    finally {
      await setting('core.site.origin', 'https://theatre.example')
    }
  })

  it('serves the rest of the feed when one contributor fails', async () => {
    const { address } = await onAShift()
    broken.failing = true
    const response = await fetchFeed(address)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain('SUMMARY:Read-through')
    expect(text).toContain('SUMMARY:Steward')
  })

  it('adds nothing from a module that is off', async () => {
    const { address } = await onAShift()
    await setModule('rehearse', false)
    try {
      const text = await (await fetchFeed(address)).text()
      expect(text).not.toContain('Read-through')
      expect(text).toContain('SUMMARY:Steward')
    }
    finally {
      await setModule('rehearse', true)
    }
  })
})

describe('calendar-feed-token', () => {
  it('stores only the hash, answers private and no-store, and a reset address stops at once', async () => {
    const { eve, address } = await onAShift()
    const token = new URL(address).pathname.replace(/^\/calendar\/|\.ics$/g, '')
    const [row] = await rows<{ token_hash: string, generation: number }>('SELECT token_hash, generation FROM calendar_feed_tokens WHERE account_id = ?', eve.accountId)
    expect(row!.token_hash).not.toBe(token)
    expect(row!.token_hash).toBe(await inContext(() => linkTokens.hash(token)))
    const response = await fetchFeed(address)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-type')).toContain('text/calendar')
    const fresh = (await req('POST', '/api/calendar-feed/me/reset', {}, eve)).body.url as string
    expect((await fetchFeed(address)).status).toBe(404)
    expect((await fetchFeed(fresh)).status).toBe(200)
  })

  it('answers not found, never an empty calendar, for a token nobody holds', async () => {
    expect((await call(handle, 'GET', '/calendar/not-a-real-token.ics')).status).toBe(404)
  })

  it('goes with the account when it is erased (CF6)', async () => {
    const plan = await inContext(async () => erasurePlan())
    expect(plan.find(step => step.table === 'calendar_feed_tokens')).toEqual(expect.objectContaining({ action: 'delete' }))
  })
})

describe('calendar-feed-foh-carryover', () => {
  it('still answers a Front of house address, now with the whole feed', async () => {
    const { eve } = await onAShift()
    const token = (await rows<{ generation: number }>('SELECT generation FROM calendar_feed_tokens WHERE account_id = ?', eve.accountId))[0]!
    const old = await inContext(() => linkTokens.hash(`front-of-house.feed:${eve.accountId}:${token.generation}`))
    const response = await call(handle, 'GET', `/api/front-of-house/calendar/${old}`)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain('SUMMARY:Read-through')
    expect(text).toContain('SUMMARY:Steward')
  })
})
