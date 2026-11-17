// Settings history and Revert, and when saving a setting asks for a fresh sign-in (settings build
// brief, agreed by Matt on 16 November 2026).
import { afterEach, describe, expect, it } from 'vitest'
import settingsGet from '../../server/api/core/settings/index.get'
import settingsPut from '../../server/api/core/settings/index.put'
import history from '../../server/api/core/settings/history.get'
import revert from '../../server/api/core/settings/history/[id]/revert.post'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, person, server } from '../../../../tests/integration/helpers'

const handle = server({
  'GET /api/core/settings': settingsGet,
  'PUT /api/core/settings': settingsPut,
  'GET /api/core/settings/history': history,
  'POST /api/core/settings/history/:id/revert': revert,
})

type Change = { id: string, key: string, before: unknown, after: unknown, reason: string | null, revertible: boolean }
const save = (actor: ReturnType<typeof person>, changes: unknown[], extra: object = {}) => call(handle, 'PUT', '/api/core/settings', { actor, body: { changes, ...extra } })
const changesOf = async (query: string, actor: ReturnType<typeof person>) => (await (await call(handle, 'GET', `/api/core/settings/history?${query}`, { actor })).json()) as { changes: Change[], next: string | null }
const audits = async () => (await env.DB.prepare('SELECT count(*) AS n FROM core_audit WHERE ability = ? AND action = ?').bind('core.audit.view', 'read').first<{ n: number }>())!.n

afterEach(async () => {
  resetRateLimits()
  await env.DB.prepare('DELETE FROM core_settings WHERE key IN (?, ?)').bind('core.jobs.attempts', 'core.rate-limits.export').run()
})

describe('saving a setting', () => {
  const stale = () => person(['core.settings.manage'], { reassertedAt: 0 })

  it('asks for no fresh sign-in, though the ability is privileged', async () => {
    expect((await save(stale(), [{ key: 'core.jobs.attempts', value: 6 }])).status).toBe(200)
  })
  it('asks for a fresh sign-in when the setting asks for confirmation', async () => {
    const refused = await save(stale(), [{ key: 'core.rate-limits.export', value: { count: 12, per: '1h' } }], { confirm: true })
    expect(refused.status).toBe(403)
    expect(((await refused.json()) as { code: string }).code).toBe('core.access.not-fresh')
    expect((await save(person(['core.settings.manage']), [{ key: 'core.rate-limits.export', value: { count: 12, per: '1h' } }], { confirm: true })).status).toBe(200)
  })
})

describe('a setting\'s history', () => {
  it('lists changes newest first, with the values, for whoever may change the setting', async () => {
    const admin = person(['core.settings.manage'])
    await save(admin, [{ key: 'core.jobs.attempts', value: 6 }])
    await save(admin, [{ key: 'core.jobs.attempts', value: 7 }])
    const before = await audits()
    const { changes } = await changesOf('key=core.jobs.attempts', admin)
    expect(changes.slice(0, 2).map(c => [c.before, c.after])).toEqual([[6, 7], [5, 6]])
    expect(changes[0]!.revertible).toBe(true)
    expect(await audits()).toBe(before) // one setting's own history is not an audit search
    const page = await (await call(handle, 'GET', '/api/core/settings?page=core.advanced', { actor: admin })).json() as { settings: { key: string, lastChange: { at: number } | null }[] }
    expect(page.settings.find(s => s.key === 'core.jobs.attempts')!.lastChange?.at).toBeGreaterThan(0)
  })

  it('opens the whole history only with core.audit.view, and records each search', async () => {
    expect((await call(handle, 'GET', '/api/core/settings/history?page=core.advanced', { actor: person(['core.settings.manage']) })).status).toBe(403)
    const auditor = person(['core.audit.view'])
    const before = await audits()
    const { changes } = await changesOf('page=core.advanced', auditor)
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every(c => c.revertible === false)).toBe(true) // seeing the history is not changing the setting
    expect(await audits()).toBe(before + 1)
  })
})

describe('Revert', () => {
  it('sets a setting back to the value before a change, as a change of its own', async () => {
    const admin = person(['core.settings.manage'])
    await save(admin, [{ key: 'core.jobs.attempts', value: 6 }])
    await save(admin, [{ key: 'core.jobs.attempts', value: 7 }])
    const [latest] = (await changesOf('key=core.jobs.attempts', admin)).changes
    expect((await call(handle, 'POST', `/api/core/settings/history/${latest!.id}/revert`, { actor: admin, body: {} })).status).toBe(200)
    const after = (await changesOf('key=core.jobs.attempts', admin)).changes
    expect(after[0]).toMatchObject({ before: 7, after: 6, reason: 'Reverted' })
  })

  it('makes a change back to the default a reset, so the setting follows the default again', async () => {
    const admin = person(['core.settings.manage'])
    await save(admin, [{ key: 'core.jobs.attempts', value: 6 }])
    const [first] = (await changesOf('key=core.jobs.attempts', admin)).changes
    await call(handle, 'POST', `/api/core/settings/history/${first!.id}/revert`, { actor: admin, body: {} })
    expect(await env.DB.prepare('SELECT 1 FROM core_settings WHERE key = ?').bind('core.jobs.attempts').first()).toBeNull()
  })

  it('applies the same ability and confirmation as a save', async () => {
    const admin = person(['core.settings.manage'])
    await save(admin, [{ key: 'core.rate-limits.export', value: { count: 12, per: '1h' } }], { confirm: true })
    const [change] = (await changesOf('key=core.rate-limits.export', admin)).changes
    expect((await call(handle, 'POST', `/api/core/settings/history/${change!.id}/revert`, { actor: person(['core.audit.view']), body: { confirm: true } })).status).toBe(403)
    expect((await call(handle, 'POST', `/api/core/settings/history/${change!.id}/revert`, { actor: admin, body: {} })).status).toBe(422)
    expect((await call(handle, 'POST', `/api/core/settings/history/${change!.id}/revert`, { actor: admin, body: { confirm: true } })).status).toBe(200)
  })
})
