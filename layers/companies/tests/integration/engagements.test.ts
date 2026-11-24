// CO-12 and CO-16 (part 8): linking a production gives it the company's public name and keeps it in
// step on rename; a second engagement on that production refuses; cancelling releases guest places and
// withdraws a sent agreement, leaving the production alone. The staff list and page read them back.
import { beforeAll, describe, expect, it } from 'vitest'
import { newId } from '#kit'
import type { Actor } from '#kit'
import { call, env, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import companiesPost from '../../server/api/companies/index.post'
import companyPatch from '../../server/api/companies/[id]/index.patch'
import engagementsPost from '../../server/api/companies/[id]/engagements.post'
import engagementsGet from '../../server/api/companies/engagements/index.get'
import staffGet from '../../server/api/companies/engagements/[id]/staff.get'
import productionPost from '../../server/api/companies/engagements/[id]/production.post'
import movePost from '../../server/api/companies/engagements/[id]/[move].post'

const app = server({
  'POST /api/companies': companiesPost,
  'PATCH /api/companies/:id': companyPatch,
  'POST /api/companies/:id/engagements': engagementsPost,
  'GET /api/companies/engagements': engagementsGet,
  'GET /api/companies/engagements/:id/staff': staffGet,
  'POST /api/companies/engagements/:id/production': productionPost,
  'POST /api/companies/engagements/:id/:move': movePost,
})

const admin = person(['companies.company.manage', 'companies.engagement.manage'])

async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

async function production(title: string): Promise<string> {
  const id = newId('prd')
  await env.DB.prepare('INSERT INTO core_productions (id, slug, title, kind, running_minutes, state, listed, credits_public, interval_count, advisories_confirmed_none, created_at) VALUES (?, ?, ?, \'visiting\', 90, \'draft\', 1, 1, 0, 0, 0)')
    .bind(id, id, title).run()
  return id
}

const companyName = async (productionId: string) => (await rows<{ company_name: string | null }>('SELECT company_name FROM core_productions WHERE id = ?', productionId))[0]!.company_name

beforeAll(async () => {
  for (const id of ['finance', 'payments', 'companies']) await setModule(id, true)
})

describe('linking a production (CO-12, E6, G3)', () => {
  it('names the production after the company, keeps it in step, and refuses a second engagement', async () => {
    const companyId = (await req(admin, 'POST', '/api/companies', { name: 'Kneehigh Kin', publicName: 'Kneehigh' })).body.companyId
    const prd = await production('The Red Shoes')
    const opened = await req(admin, 'POST', `/api/companies/${companyId}/engagements`, { kind: 'visiting', productionId: prd })
    expect(opened.status).toBe(200)
    expect(await companyName(prd)).toBe('Kneehigh')

    await req(admin, 'PATCH', `/api/companies/${companyId}`, { publicName: 'Kneehigh Theatre' })
    expect(await companyName(prd)).toBe('Kneehigh Theatre')

    const other = (await req(admin, 'POST', '/api/companies', { name: 'Interlopers' })).body.companyId
    expect((await req(admin, 'POST', `/api/companies/${other}/engagements`, { kind: 'visiting', productionId: prd })).body.code).toBe('companies.engagement.production-taken')
  })

  it('links a production to an engagement opened without one, once', async () => {
    const companyId = (await req(admin, 'POST', '/api/companies', { name: 'Later Link' })).body.companyId
    const engagementId = (await req(admin, 'POST', `/api/companies/${companyId}/engagements`, { kind: 'visiting', title: 'Something new' })).body.engagementId
    const prd = await production('Something New')
    expect((await req(admin, 'POST', `/api/companies/engagements/${engagementId}/production`, { productionId: prd })).status).toBe(200)
    expect(await companyName(prd)).toBe('Later Link')
    expect((await req(admin, 'POST', `/api/companies/engagements/${engagementId}/production`, { productionId: await production('Another') })).body.code).toBe('companies.engagement.linked')
    const page = (await req(admin, 'GET', `/api/companies/engagements/${engagementId}/staff`)).body
    expect(page).toMatchObject({ production: 'Something New', company: 'Later Link', canManage: true })
    expect(page.history.map((h: { kind: string }) => h.kind)).toEqual(['linked', 'opened'])
  })
})

describe('cancelling (CO-16, E5)', () => {
  it('releases guest places and withdraws a sent agreement, and leaves the production', async () => {
    const companyId = (await req(admin, 'POST', '/api/companies', { name: 'Fell Through' })).body.companyId
    const prd = await production('Never Was')
    const engagementId = (await req(admin, 'POST', `/api/companies/${companyId}/engagements`, { kind: 'visiting', productionId: prd })).body.engagementId
    await rows('INSERT INTO companies_allocations (id, engagement_id, performance_id, places, names_due_at, created_at, updated_at) VALUES (?, ?, \'prf_x\', 2, 9999999999999, 0, 0)', newId('cpg'), engagementId)
    await rows('INSERT INTO companies_agreements (id, engagement_id, version, deal_type, guest_names_due, settle_within, created_at) VALUES (?, ?, 1, \'none\', \'24h\', \'14d\', 0)', newId('cpa'), engagementId)
    await rows('UPDATE companies_agreements SET state = \'sent\', sent_at = 1 WHERE engagement_id = ?', engagementId)

    expect((await req(admin, 'POST', `/api/companies/engagements/${engagementId}/cancel`, {})).body.code).toBe('companies.engagement.reason-needed')
    expect((await req(admin, 'POST', `/api/companies/engagements/${engagementId}/cancel`, { reason: 'The tour was called off' })).status).toBe(200)
    expect(await rows('SELECT state FROM companies_allocations WHERE engagement_id = ?', engagementId)).toEqual([{ state: 'released' }])
    expect(await rows('SELECT state FROM companies_agreements WHERE engagement_id = ?', engagementId)).toEqual([{ state: 'withdrawn' }])
    expect(await rows('SELECT state, company_name FROM core_productions WHERE id = ?', prd)).toEqual([{ state: 'draft', company_name: 'Fell Through' }])

    const list = (await req(person(['companies.engagement.view']), 'GET', '/api/companies/engagements')).body
    expect(list.canManage).toBe(false)
    expect(list.engagements.find((e: { id: string }) => e.id === engagementId)).toMatchObject({ state: 'cancelled', company: 'Fell Through' })
  })
})
