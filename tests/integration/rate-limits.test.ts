// F-36: the classes that guard against guessing and flooding count in one store shared by every
// copy of the Worker (the RateLimitCounter Durable Object), and every allowance is a count in a
// period read from core.rate-limits.<class>.
import { afterEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit } from '#kit'
import { memoryRateStore, resetRateLimits, sharedRateStore, takeRate } from '#kit/ratelimit'
import { setClock, advanceClock } from '#kit/clock'
import { env, inContext } from './helpers'

async function setRate(key: string, value: { count: number, per: string } | null) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, value === null ? { reset: true, reason: 'test', confirm: true } : { reason: 'test', confirm: true })
    await unit.commit()
  })
}

const take = (rateClass: Parameters<typeof takeRate>[0], who: string) => inContext(() => takeRate(rateClass, who))
const namespace = () => env.RATE_LIMITS as unknown as Parameters<typeof sharedRateStore>[0]

afterEach(async () => {
  setClock(undefined)
  resetRateLimits()
  for (const key of ['sign-in', 'export']) await setRate(`core.rate-limits.${key}`, null)
  await env.DB.prepare('DELETE FROM core_settings WHERE key LIKE ?').bind('core.rate-limits.%').run()
})

describe('shared rate limits (F-36)', () => {
  it('keeps one count for two instances of the Worker', async () => {
    const limit = { count: 3, per: 600 }
    const at = Date.UTC(2026, 10, 16, 20)
    const key = `sign-in:address:two-instances-${crypto.randomUUID()}`

    // Two instances counting in memory each allow the full allowance: six get through, not three.
    const [a, b] = [memoryRateStore(), memoryRateStore()]
    const apart = []
    for (const store of [a, b, a, b, a, b]) apart.push((await store.take(key, limit, at)).allowed)
    expect(apart.filter(Boolean)).toHaveLength(6)

    // Two instances counting in the shared store keep one count: the fourth request is refused,
    // whichever instance it reaches.
    const [one, two] = [sharedRateStore(namespace()), sharedRateStore(namespace())]
    const shared = []
    for (const store of [one, two, one, two]) shared.push((await store.take(key, limit, at)).allowed)
    expect(shared).toEqual([true, true, true, false])
  })

  it('reads the allowance as a count in a period from core.rate-limits.<class>', async () => {
    setClock(Date.UTC(2026, 10, 16, 20))
    await setRate('core.rate-limits.sign-in', { count: 2, per: '10m' })
    const who = `address:${crypto.randomUUID()}@example.org`
    const decisions = []
    for (let i = 0; i < 3; i++) decisions.push(await take('sign-in', who)) // not-policy: one more than the allowance
    expect(decisions.map(d => d.allowed)).toEqual([true, true, false])
    expect(decisions[2]!.retryAfter).toBe(600) // not-policy: ten minutes in seconds

    advanceClock(9 * 60_000) // not-policy: nine minutes in
    expect(await take('sign-in', who)).toEqual({ allowed: false, retryAfter: 60 })
    advanceClock(60_000) // not-policy: the window ends
    expect((await take('sign-in', who)).allowed).toBe(true)
  })

  it('counts the sign-in class in the shared store, so a second instance sees the first one\'s count', async () => {
    setClock(Date.UTC(2026, 10, 16, 20))
    await setRate('core.rate-limits.sign-in', { count: 1, per: '10m' })
    const who = `address:${crypto.randomUUID()}@example.org`
    expect((await take('sign-in', who)).allowed).toBe(true)
    // Another instance: its own memory, the same shared store.
    const other = sharedRateStore(namespace())
    expect((await other.take(`sign-in:${who}`, { count: 1, per: 600 }, Date.UTC(2026, 10, 16, 20))).allowed).toBe(false)
  })

  it('reads an allowance saved before F-36, a whole number, as so many a minute', async () => {
    setClock(Date.UTC(2026, 10, 16, 20))
    await env.DB.prepare('INSERT INTO core_settings (key, value, updated_at) VALUES (?, ?, ?)').bind('core.rate-limits.export', '1', Date.UTC(2026, 10, 16)).run()
    const who = `account:${crypto.randomUUID()}`
    expect((await take('export', who)).allowed).toBe(true)
    expect(await take('export', who)).toEqual({ allowed: false, retryAfter: 60 })
  })

  it('refuses a rate setting outside 1 to 10,000 in 1 minute to 1 day', async () => {
    await expect(setRate('core.rate-limits.sign-in', { count: 0, per: '10m' })).rejects.toThrow(/between 1 and 10,000/)
    await expect(setRate('core.rate-limits.sign-in', { count: 10, per: '2d' })).rejects.toThrow(/between 1 minute and 1 day/)
  })
})
