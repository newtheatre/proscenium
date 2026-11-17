// One origin, enforced (Foundations part 4): setup records the site's origin; once it is recorded,
// reads on another host are redirected and changes there refused; siteUrl answers from it in a job;
// the Worker variable CORE_SITE_ORIGIN prevails.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp, createRouter, toWebHandler } from 'h3'
import { createUnit, runInContext, siteUrl } from '#kit'
import { runJob } from '#kit/jobs'
import siteOriginRedirect from '../../../server/middleware/00.site-origin'
import health from '../../../server/contributions/core.health-check/site-origin'
import { Authenticator } from './authenticator'
import { Browser, clearSetting, env, leaveIdentity, reset, setSetting, setUpOwner, signInByEmail, useIdentity } from './helpers'
import { inContext, rows } from '../../../../../tests/integration/helpers'

beforeAll(useIdentity)
afterAll(leaveIdentity)
afterEach(async () => {
  reset()
  await clearSetting('core.site.origin')
})

describe('the site\'s one origin', () => {
  it('is recorded by setup from the address setup ran on', async () => {
    await setUpOwner(new Browser(), new Authenticator())
    expect(await rows('SELECT value FROM core_settings WHERE key = \'core.site.origin\'')).toEqual([{ value: '"https://test"' }])
  })

  it('answers siteUrl from the setting, the Worker variable before it, and the request only while neither is set', async () => {
    await expect(inContext(() => siteUrl('/tickets/abc'))).rejects.toMatchObject({ code: 'core.site.origin-unset' })
    expect(await runInContext({ env, requestOrigin: 'https://here.example.org' }, () => siteUrl('/t'))).toBe('https://here.example.org/t')
    await setSetting('core.site.origin', 'https://tickets.example.org')
    expect(await inContext(() => siteUrl('/tickets/abc'))).toBe('https://tickets.example.org/tickets/abc')
    expect(await runInContext({ env: { ...env, CORE_SITE_ORIGIN: 'https://new.example.org' } }, () => siteUrl('/t'))).toBe('https://new.example.org/t')
    await expect(inContext(() => siteUrl('t'))).rejects.toThrow(/one \//)
  })

  it('refuses a change sent on another host once recorded, and allows it before', async () => {
    const browser = new Browser()
    await signInByEmail(browser)
    expect((await browser.patch('/api/core/me', { preferredName: 'Pat' })).status).toBe(200)
    await setSetting('core.site.origin', 'https://tickets.example.org')
    const refused = await browser.patch('/api/core/me', { preferredName: 'Sam' })
    expect(refused.status).toBe(403)
    expect(refused.body).toMatchObject({ code: 'core.access.wrong-origin', remedy: 'Use https://tickets.example.org.' })
  })

  it('redirects a read on another host to the same address on the origin, but not the health probe or a webhook', async () => {
    const app = createApp({ onRequest(event) { event.context.cloudflare = { env } } })
    app.use(siteOriginRedirect)
    const router = createRouter()
    router.get('/**', () => 'page')
    router.post('/**', () => 'changed')
    app.use(router)
    const handle = toWebHandler(app)
    const get = (url: string, method = 'GET') => handle(new Request(url, { method, redirect: 'manual' }))
    expect((await get('https://other.workers.dev/shows/hamlet?x=1')).status).toBe(200)
    await setSetting('core.site.origin', 'https://tickets.example.org')
    const moved = await get('https://other.workers.dev/shows/hamlet?x=1')
    expect(moved.status).toBe(307)
    expect(moved.headers.get('location')).toBe('https://tickets.example.org/shows/hamlet?x=1')
    expect((await get('https://tickets.example.org/shows/hamlet')).status).toBe(200)
    expect((await get('https://other.workers.dev/api/core/health')).status).toBe(200)
    expect((await get('https://other.workers.dev/api/payments/webhooks/pac_1')).status).toBe(200)
    expect((await get('https://other.workers.dev/shows', 'POST')).status).toBe(200)
  })

  it('defers a job that needs the address while none is recorded, without spending an attempt', async () => {
    const id = await inContext(async () => {
      const unit = createUnit()
      const job = unit.enqueue('seats.send-link', { title: 'needs-origin' })
      await unit.commit()
      return job
    })
    expect(await inContext(() => runJob(id))).toBe('deferred')
    expect(await rows('SELECT state, attempts, deferrals FROM core_jobs WHERE id = ?', id)).toEqual([{ state: 'queued', attempts: 0, deferrals: 1 }])
    expect(await rows('SELECT id FROM seats_performances WHERE title = \'needs-origin\'')).toEqual([])
    await setSetting('core.site.origin', 'https://tickets.example.org')
    await env.DB.prepare('UPDATE core_jobs SET run_after = 0 WHERE id = ?').bind(id).run()
    expect(await inContext(() => runJob(id))).toBe('done')
    expect(await rows('SELECT count(*) AS n FROM seats_performances WHERE title = \'https://tickets.example.org/shows/needs-origin\'')).toEqual([{ n: 1 }])
  })

  it('is reported by the health check', async () => {
    expect(await runInContext({ env, requestOrigin: 'https://here.example.org' }, () => health.check())).toMatchObject({ state: 'warning', remedy: expect.stringContaining('https://here.example.org') })
    await setSetting('core.site.origin', 'https://tickets.example.org')
    expect(await inContext(() => health.check())).toMatchObject({ state: 'ok', sentence: 'The site\'s address is https://tickets.example.org.' })
    expect(await runInContext({ env: { ...env, CORE_SITE_ORIGIN: 'https://new.example.org' } }, () => health.check())).toMatchObject({ state: 'warning' })
    expect(await runInContext({ env: { ...env, CORE_SITE_ORIGIN: 'tickets' } }, () => health.check())).toMatchObject({ state: 'failing' })
  })
})
