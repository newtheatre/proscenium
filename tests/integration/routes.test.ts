// F-04 routes declare who may call them and refuse in one shape; F-09 settings are typed and
// bounded; F-10 module switching; idempotency and rate limits.
import { afterEach, describe, expect, it } from 'vitest'
import health from '../../layers/core/server/api/core/health.get'
import publicSettings from '../../layers/core/server/api/core/settings/public.get'
import putSetting from '../../layers/core/server/api/core/settings/[key].put'
import putModule from '../../layers/core/server/api/core/modules/[id].put'
import sell from '../fixtures/modules/seats/server/api/seats/[id]/sell.post'
import { resetRateLimits } from '#kit/ratelimit'
import { changeSetting, createUnit } from '#kit'
import { call, inContext, performance, person, rows, server, setModule } from './helpers'

const handle = server({
  'GET /api/core/health': health,
  'GET /api/core/settings/public': publicSettings,
  'PUT /api/core/settings/:key': putSetting,
  'PUT /api/core/modules/:id': putModule,
  'POST /api/seats/:id/sell': sell,
})
const seller = () => person(['seats.orders.sell'])
const manager = () => person(['seats.settings.manage', 'core.modules.manage', 'core.settings.manage'])

afterEach(async () => {
  resetRateLimits()
  await setModule('seats', true)
})

describe('routes (F-04)', () => {
  it('lets anyone call a public route', async () => {
    const response = await call(handle, 'GET', '/api/core/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok' })
  })

  it('refuses a signed-out caller with the standard body', async () => {
    const id = await performance()
    const response = await call(handle, 'POST', `/api/seats/${id}/sell`, { body: { quantity: 1 }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'core.access.signed-out', reason: expect.any(String) })
  })

  it('refuses a person without the ability', async () => {
    const id = await performance()
    const response = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor: person([]), body: { quantity: 1 }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.status).toBe(403)
    expect((await response.json()).code).toMatch(/^core\.access\./)
  })

  it('checks the ability before the input, so a refused caller learns nothing of its shape', async () => {
    const id = await performance()
    const response = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor: person([]), body: { quantity: 'two' }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.status).toBe(403)
  })

  it('names the invalid fields', async () => {
    const id = await performance()
    const response = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor: seller(), body: { quantity: 'two' }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'core.input.invalid', fields: { quantity: expect.any(String) } })
  })

  it('sells, audits and announces in one unit, and turns a lost race into a refusal', async () => {
    const id = await performance(2)
    const ok = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor: seller(), body: { quantity: 2 }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(ok.status).toBe(200)
    expect(await rows('SELECT action, ability FROM core_audit WHERE record_id = ?', id)).toEqual([{ action: 'create', ability: 'seats.orders.sell' }])
    const soldOut = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor: seller(), body: { quantity: 1 }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(soldOut.status).toBe(409)
    expect(await soldOut.json()).toMatchObject({ code: 'seats.sold-out' })
  })

  it('replays a repeated request with the same Idempotency-Key and refuses the key on a different one', async () => {
    const id = await performance(5)
    const key = crypto.randomUUID()
    const actor = seller()
    const first = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor, body: { quantity: 1 }, headers: { 'idempotency-key': key } })
    const second = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor, body: { quantity: 1 }, headers: { 'idempotency-key': key } })
    expect(second.headers.get('idempotent-replay')).toBe('true')
    expect(await second.json()).toEqual(await first.json())
    expect(await rows('SELECT sold FROM seats_performances WHERE id = ?', id)).toEqual([{ sold: 1 }])
    const reused = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor, body: { quantity: 2 }, headers: { 'idempotency-key': key } })
    expect(reused.status).toBe(422)
    expect(await reused.json()).toMatchObject({ code: 'core.idempotency.key-reused' })
    const missing = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor, body: { quantity: 1 } })
    expect(missing.status).toBe(400)
  })

  it('answers 404 for a switched-off module\'s routes', async () => {
    const id = await performance()
    await setModule('seats', false)
    const response = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor: seller(), body: { quantity: 1 }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(response.status).toBe(404)
  })

  it('limits the rate per person with a 429 and Retry-After', async () => {
    await inContext(async () => {
      const unit = createUnit()
      await changeSetting(unit.view(), 'core.rate-limits.write', { count: 5, per: '1m' }, { reason: 'test', confirm: true })
      await unit.commit()
    })
    try {
      const actor = person(['core.settings.manage'])
      const responses: Response[] = []
      for (let i = 0; i < 6; i++) responses.push(await call(handle, 'PUT', '/api/core/settings/core.jobs.attempts', { actor, body: { value: 5 } }))
      expect(responses.slice(0, 5).every(r => r.status === 200)).toBe(true)
      expect(responses[5]!.status).toBe(429)
      const retryAfter = Number(responses[5]!.headers.get('retry-after'))
      expect(retryAfter).toBeGreaterThan(0)
      expect(retryAfter).toBeLessThanOrEqual(60)
    }
    finally {
      await inContext(async () => {
        const unit = createUnit()
        await changeSetting(unit.view(), 'core.rate-limits.write', null, { reset: true, reason: 'test', confirm: true })
        await unit.commit()
      })
    }
  })
})

describe('settings (F-09)', () => {
  it('refuses a value outside the declared limits and names the limit', async () => {
    const response = await call(handle, 'PUT', '/api/core/settings/seats.orders.max-seats', { actor: manager(), body: { value: 11 } })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'core.setting.invalid' })
  })

  it('refuses a person without the setting\'s change ability', async () => {
    const response = await call(handle, 'PUT', '/api/core/settings/seats.orders.max-seats', { actor: seller(), body: { value: 4 } })
    expect(response.status).toBe(403)
  })

  it('changes a setting, records the change and the module sees it at once', async () => {
    const changed = await call(handle, 'PUT', '/api/core/settings/seats.orders.max-seats', { actor: manager(), body: { value: 2, reason: 'Small house tonight' } })
    expect(changed.status).toBe(200)
    expect(await rows("SELECT new_value FROM core_setting_changes WHERE key = 'seats.orders.max-seats' ORDER BY at DESC LIMIT 1")).toEqual([{ new_value: '2' }])
    const id = await performance(10)
    const tooMany = await call(handle, 'POST', `/api/seats/${id}/sell`, { actor: seller(), body: { quantity: 3 }, headers: { 'idempotency-key': crypto.randomUUID() } })
    expect(tooMany.status).toBe(422)
    expect(await tooMany.json()).toMatchObject({ code: 'seats.too-many' })
    await call(handle, 'PUT', '/api/core/settings/seats.orders.max-seats', { actor: manager(), body: { reset: true } })
  })

  it('refuses an unknown setting', async () => {
    const response = await call(handle, 'PUT', '/api/core/settings/seats.orders.nonsense', { actor: manager(), body: { value: 1 } })
    expect(response.status).toBe(404)
  })

  it('applies cross-setting rules', async () => {
    const response = await call(handle, 'PUT', '/api/core/settings/core.locale.currency', { actor: manager(), body: { value: 'gbp' } })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'core.setting.rule-failed' })
  })

  it('shows public settings, with text for quotable ones', async () => {
    const body = await (await call(handle, 'GET', '/api/core/settings/public')).json()
    expect(body['core.locale.currency']).toEqual({ value: 'GBP', text: 'GBP' })
    expect(body['core.jobs.attempts']).toBeUndefined()
  })
})

describe('modules (F-10)', () => {
  it('switches a module off and on, announcing each', async () => {
    const off = await call(handle, 'PUT', '/api/core/modules/notify', { actor: manager(), body: { on: false } })
    expect(off.status).toBe(200)
    expect(await rows("SELECT enabled FROM core_modules WHERE module_id = 'notify'")).toEqual([{ enabled: 0 }])
    await call(handle, 'PUT', '/api/core/modules/notify', { actor: manager(), body: { on: true } })
    expect(await rows("SELECT name FROM core_events WHERE name IN ('core.module.disabled', 'core.module.enabled') AND json_extract(payload, '$.moduleId') = 'notify'")).toHaveLength(2)
  })

  it('refuses to switch off the core', async () => {
    const response = await call(handle, 'PUT', '/api/core/modules/core', { actor: manager(), body: { on: false } })
    expect(response.status).toBe(409)
  })
})
