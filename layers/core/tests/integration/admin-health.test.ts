// AC-5 and AC-12: the Admin overview's health card lists every health check that is not ok, such as
// email that cannot be sent or no privacy contact, and only for someone who may see the site's health.
import { afterEach, describe, expect, it } from 'vitest'
import { usePoint } from '#kit'
import problems from '../../server/api/core/health/problems.get'
import { healthProblems } from '../../server/interface/health'
import type { Count } from '../../server/points/count'
import { call, env, inContext, person, server } from '../../../../tests/integration/helpers'

const handle = server({ 'GET /api/core/health/problems': problems })
const admin = person(['core.health.view'])
const nobody = person([])
const attention = (actor: ReturnType<typeof person>) => inContext(async () => {
  const [found] = (await usePoint<Count>('core.count')).filter(c => c.id === 'core.health-attention')
  return found!.value.value(actor)
}, actor)

afterEach(async () => {
  await env.DB.prepare('DELETE FROM core_settings WHERE key = ?').bind('core.privacy.contact').run()
})

describe('health on the Admin overview (AC-5, AC-12)', () => {
  it('lists failing and amber checks, failing first, each with where to put it right', async () => {
    await env.DB.prepare('DELETE FROM core_settings WHERE key = ?').bind('core.privacy.contact').run()
    const found = await inContext(() => healthProblems())
    const privacy = found.find(p => p.id === 'core.privacy-contact')
    expect(privacy).toMatchObject({ state: 'warning', to: '/admin/privacy?setting=core.privacy.contact' })
    const states = found.map(p => p.state)
    expect(states).toEqual([...states].sort((a, b) => Number(b === 'failing') - Number(a === 'failing')))

    await env.DB.prepare('INSERT INTO core_settings (key, value, updated_at) VALUES (?, ?, 0)').bind('core.privacy.contact', JSON.stringify('privacy@example.org')).run()
    expect((await inContext(() => healthProblems())).some(p => p.id === 'core.privacy-contact')).toBe(false)
  })

  it('counts and lists them only for someone who may see the site\'s health', async () => {
    expect(await attention(admin)).toBeGreaterThan(0)
    expect(await attention(nobody)).toBe(0)
    const ok = await call(handle, 'GET', '/api/core/health/problems', { actor: admin })
    expect(ok.status).toBe(200)
    expect((await ok.json() as { problems: unknown[] }).problems.length).toBe(await attention(admin))
    expect((await call(handle, 'GET', '/api/core/health/problems', { actor: nobody })).status).toBe(403)
  })
})
