// Policies at run time: which exist, which sections one shows today, and that the text a version
// would record states the live value of every setting it quotes, with nothing left empty.
import { afterEach, describe, expect, it } from 'vitest'
import { changeSetting, createUnit } from '#kit'
import list from '../../server/api/core/policies/index.get'
import one from '../../server/api/core/policies/[id].get'
import pageContext from '../../server/api/core/policies/context.get'
import { listPolicies, policyContext, policyText, resolvePolicy } from '../../server/policies/service'
import { call, env, inContext, server } from '../../../../tests/integration/helpers'

const handle = server({ 'GET /api/core/policies': list, 'GET /api/core/policies/context': pageContext, 'GET /api/core/policies/:id': one })
const set = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit.view(), key as never, value as never, { reason: 'test', confirm: true })
  await unit.commit()
})
const KEYS = ['core.visiting.latecomers', 'core.organisation.legal-name', 'core.organisation.country', 'core.privacy.contact', 'core.accounts.minimum-age']

afterEach(async () => {
  for (const key of KEYS) await env.DB.prepare('DELETE FROM core_settings WHERE key = ?').bind(key).run()
})

describe('policies', () => {
  it('lists core\'s four policies in footer order, to anyone', async () => {
    const body = await (await call(handle, 'GET', '/api/core/policies')).json() as { policies: { id: string }[] }
    expect(body.policies.map(p => p.id).slice(0, 4)).toEqual(['privacy', 'terms', 'accessibility', 'visiting'])
  })

  it('gives a policy\'s sections in order, each with its place in the content collection', async () => {
    const body = await (await call(handle, 'GET', '/api/core/policies/terms')).json() as { policy: { title: string, kind: string }, sections: { id: string, path: string }[], revised: string }
    expect(body.policy).toMatchObject({ title: 'Terms of use', kind: 'terms' })
    expect(body.sections[0]).toEqual({ id: 'summary', title: 'The short version', path: '/core/terms/summary' })
    expect(body.sections.map(s => s.id)).toContain('which-law')
    expect(body.revised).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('answers 404 for a policy that does not exist', async () => {
    expect((await call(handle, 'GET', '/api/core/policies/nonsense')).status).toBe(404)
  })

  it('leaves out the sections that state another country\'s law', async () => {
    await set('core.organisation.country', 'FR')
    const found = await inContext(() => resolvePolicy('terms'))
    expect(found!.sections.map(s => s.id)).not.toContain('which-law')
    expect(found!.sections.map(s => s.id)).toContain('your-account')
  })

  it('leaves what the theatre must write off the page, and lists it', async () => {
    const found = await inContext(() => resolvePolicy('accessibility'))
    expect(found!.sections.map(s => s.id)).not.toContain('how-we-tested')
    expect(found!.unwritten.map(s => s.id)).toEqual(expect.arrayContaining(['how-we-tested', 'access-performances']))
  })

  it('says what the settings say, and changes when they change', async () => {
    const before = await inContext(async () => policyText((await resolvePolicy('visiting'))!))
    expect(before).toContain('we will let you in at the first suitable moment')
    expect(before).toContain('Children under 14 must come with an adult')
    await set('core.visiting.latecomers', 'not-admitted')
    const after = await inContext(async () => policyText((await resolvePolicy('visiting'))!))
    expect(after).toContain('Once a performance has started we cannot let anyone in')
    expect(after).not.toContain('first suitable moment')
  })

  it('names the theatre once it has a legal name and a privacy contact', async () => {
    const bare = await inContext(async () => policyText((await resolvePolicy('privacy'))!))
    expect(bare).toContain('use the contact details on this website')
    await set('core.organisation.legal-name', 'The Playhouse Trust')
    await set('core.privacy.contact', 'privacy@playhouse.example')
    const named = await inContext(async () => policyText((await resolvePolicy('privacy'))!))
    expect(named).toContain('is run by The Playhouse Trust')
    expect(named).toContain('contact privacy@playhouse.example')
  })

  it('never records an empty value: every policy reads whole with nothing set', async () => {
    await inContext(async () => {
      const context = await policyContext()
      for (const policy of await listPolicies()) {
        const text = policyText((await resolvePolicy(policy.id, context))!)
        // A token that came out empty leaves two spaces, a space before a full stop, or "of ." behind.
        expect(text, policy.id).not.toMatch(/ {2}| \.|\(\)|:setting|:fact|::/)
      }
    })
  })

  it('builds the cookies and suppliers tables from what modules declare', async () => {
    const body = await (await call(handle, 'GET', '/api/core/policies/context')).json() as { tables: Record<string, { rows: string[][] }>, country: string }
    expect(body.country).toBe('gb')
    expect(body.tables.cookies!.rows[0]![0]).toBe('`__Host-proscenium-session`')
    expect(body.tables.suppliers!.rows.map(r => r[0])).toContain('Cloudflare')
    // Google is named only while its sign-in is on.
    expect(body.tables.suppliers!.rows.map(r => r[0])).not.toContain('Google')
    expect(body.tables['privacy-records']!.rows.length).toBeGreaterThan(3)
  })
})
