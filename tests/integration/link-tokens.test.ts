// Link tokens (Foundations part 4, T1 to T5): the kit hands a token out once and keeps its keyed
// hash; a route that carries one in its path keeps it out of the log, error reports, audit rows,
// events and job payloads.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, createRouter, getQuery, toWebHandler } from 'h3'
import { defineRoute, linkTokens, log } from '#kit'
import { env, inContext, performance } from './helpers'

afterEach(() => vi.restoreAllMocks())

describe('linkTokens', () => {
  it('issues a random token once and keeps only a hash that the token presented again matches', async () => {
    const { token, hash } = await inContext(() => linkTokens.issue())
    expect(token).toMatch(/^[\w-]{43}$/)
    expect(hash).not.toContain(token)
    expect(await inContext(() => linkTokens.hash(token))).toBe(hash)
    const other = await inContext(() => linkTokens.issue())
    expect(other.token).not.toBe(token)
    expect(other.hash).not.toBe(hash)
  })
})

describe('a route that declares a token in its path', () => {
  const errors: Error[] = []
  const app = createApp({
    onRequest(event) { event.context.cloudflare = { env } },
    onError(error) { errors.push(error) },
  })
  const router = createRouter()
  router.add('/api/seats/tickets/:token', defineRoute({ public: true, rateLimit: 'default', tokens: ['token'] }, async (event, { unit }) => {
    const token = event.context.params!.token!
    const what = getQuery(event).what
    if (what === 'log') log.info('Opened a ticket', { path: event.path, token })
    if (what === 'fail') throw new Error(`No ticket for ${token}`)
    if (what === 'audit') unit.audit({ action: 'read', detail: { token } })
    if (what === 'announce') unit.announce('seats.performance.sold', { performanceId: token, quantity: 1 })
    if (what === 'enqueue') unit.enqueue('seats.wait-a-while', { deferTimes: 0, title: `ticket ${token}` })
    if (what === 'found') unit.audit({ action: 'read', detail: { found: (await linkTokens.hash(token)).length > 0 } })
    return { ok: true }
  }), 'get')
  app.use(router)
  const handle = toWebHandler(app)
  const open = (token: string, what: string) => handle(new Request(`http://test/api/seats/tickets/${token}?what=${what}`, { headers: { host: 'test' } }))
  const token = 'Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5'

  it('writes the log without it', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
    expect((await open(token, 'log')).status).toBe(200)
    expect(lines.join('\n')).toContain('/api/seats/tickets/[token]')
    expect(lines.join('\n')).not.toContain(token)
  })

  it('reports an error without it', async () => {
    errors.length = 0
    expect((await open(token, 'fail')).status).toBe(500)
    expect(errors.map(e => `${e.message}\n${e.stack}`).join('\n')).toContain('No ticket for [token]')
    expect(errors.map(e => `${e.message}\n${e.stack}`).join('\n')).not.toContain(token)
  })

  it('refuses it in an audit row, an event or a job payload, and accepts a row without it', async () => {
    await performance()
    for (const what of ['audit', 'announce', 'enqueue']) {
      errors.length = 0
      expect((await open(token, what)).status).toBe(500)
      expect(errors[0]?.message).toMatch(/holds the link token from the address/)
    }
    expect((await open(token, 'found')).status).toBe(200)
  })
})
