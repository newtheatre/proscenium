// The gate: with maintenance mode on, a visitor gets the holding page (503, Retry-After) and the API
// a refusal, while staff, signing in and links modules keep open go on as usual. Off, nothing changes.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, createRouter, defineEventHandler, toWebHandler } from 'h3'
import { changeSetting, createUnit } from '#kit'
import gate from '../../server/middleware/10.maintenance'
import state from '../../server/api/maintenance/state.get'
import { env, inContext, person, setModule } from '../../../../tests/integration/helpers'

const app = createApp({ onRequest(event) { event.context.cloudflare = { env } } })
app.use(gate)
const router = createRouter()
router.get('/api/maintenance/state', state)
router.use('/**', defineEventHandler(() => 'the page'))
app.use(router)
const handle = toWebHandler(app)

const staff = person(['core.account.read'])
const visitor = person([])

function get(path: string, actor?: object, method = 'GET') {
  const headers: Record<string, string> = { host: 'test' }
  if (actor) headers['x-test-actor'] = JSON.stringify(actor)
  return handle(new Request(`http://test${path}`, { method, headers }))
}
const set = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit, key as never, value, { confirm: true })
  await unit.commit()
})

describe('maintenance mode', () => {
  afterEach(() => setModule('maintenance', false))

  it('changes nothing while it is off', async () => {
    const r = await get('/whats-on')
    expect(r.status).toBe(200)
    expect(await r.text()).toBe('the page')
    expect((await get('/api/maintenance/state')).status).toBe(404)
  })

  describe('while it is on', () => {
    beforeEach(() => setModule('maintenance', true))

    it('shows the public the holding page with 503 and Retry-After', async () => {
      await set('core.organisation.contact-email', 'boxoffice@example.org')
      await set('maintenance.notice.back-by', 'by 6pm')
      const r = await get('/whats-on')
      expect(r.status).toBe(503)
      expect(r.headers.get('retry-after')).toBe('3600')
      expect(r.headers.get('cache-control')).toBe('no-store')
      expect(r.headers.get('content-type')).toContain('text/html')
      const html = await r.text()
      expect(html).toContain('We will be back soon')
      expect(html).toContain('We expect to be back by 6pm.')
      expect(html).toContain('mailto:boxoffice@example.org')
    })

    it('says what the theatre wrote, escaped', async () => {
      await set('maintenance.notice.heading', 'Moving <house>')
      await set('maintenance.notice.message', 'First.\n\nSecond.')
      const html = await (await get('/')).text()
      expect(html).toContain('<h1>Moving &lt;house&gt;</h1>')
      expect(html).toContain('<p>First.</p>')
      expect(html).toContain('<p>Second.</p>')
      await set('maintenance.notice.heading', null)
      await set('maintenance.notice.message', null)
    })

    it('refuses the API with a body, not the page', async () => {
      const r = await get('/api/box-office/baskets')
      expect(r.status).toBe(503)
      expect(await r.json()).toMatchObject({ code: 'maintenance.closed' })
    })

    it('closes everything to a signed-in visitor who is not staff', async () => {
      expect((await get('/account', visitor)).status).toBe(503)
    })

    it('lets staff carry on', async () => {
      expect((await get('/whats-on', staff)).status).toBe(200)
      expect((await get('/api/box-office/baskets', staff)).status).toBe(200)
    })

    it('leaves signing in, the shells and the links modules keep open', async () => {
      for (const path of ['/sign-in', '/console', '/api/core/viewer', '/api/payments/webhooks/stripe'])
        expect((await get(path)).status, path).toBe(200)
      expect(await (await get('/api/maintenance/state')).json()).toMatchObject({ on: true })
    })

    it('answers HEAD with no body', async () => {
      const r = await get('/', undefined, 'HEAD')
      expect(r.status).toBe(503)
      expect(await r.text()).toBe('')
    })
  })
})
