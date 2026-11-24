// CO-03 (part 8, settlement-posts-once and its Invoicing case): approval retried posts one sealed
// posting keyed by the settlement; with Invoices on, approval posts nothing; never by the preparer.
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId } from '#kit'
import type { Actor } from '#kit'
import { call, env, inContext, owner, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import approvePost from '../../server/api/companies/settlements/[id]/approve.post'

const app = server({ 'POST /api/companies/settlements/:id/approve': approvePost })

const approver = person(['companies.settlement.approve'])
const preparer = owner(['companies.settlement.approve'])
const DAY = 86_400_000

async function req<T = any>(actor: Actor, path: string, key = newId('req'), balanceMinor = 6980): Promise<{ status: number, body: T }> {
  const response = await call(app, 'POST', path, { actor, body: { balanceMinor }, headers: { 'idempotency-key': key } })
  return { status: response.status, body: await response.json() as T }
}

/** A settlement as CO-22's preparing will leave it: a 70% share of 10,000p, a 20p deposit kept and a note. */
async function settlement(fields: { state: string, proposedAt?: number }): Promise<string> {
  const companyId = newId('cpy')
  const engagementId = newId('cpe')
  const productionId = newId('prd')
  const id = newId('cps')
  await env.DB.prepare('INSERT INTO core_productions (id, slug, title, kind, running_minutes, state, listed, credits_public, interval_count, advisories_confirmed_none, created_at) VALUES (?, ?, \'Medea\', \'visiting\', 90, \'draft\', 1, 1, 0, 0, 0)').bind(productionId, productionId).run()
  await rows('INSERT INTO companies_companies (id, name, created_at, updated_at) VALUES (?, ?, 0, 0)', companyId, `Company ${companyId}`)
  await rows('INSERT INTO companies_engagements (id, company_id, kind, production_id, title, state, currency, created_at, updated_at) VALUES (?, ?, \'visiting\', ?, \'Medea\', \'completed\', \'GBP\', 0, 0)', engagementId, companyId, productionId)
  await rows('INSERT INTO companies_settlements (id, engagement_id, version, statement_as_of, gross_minor, basis_minor, balance_minor, currency, state, proposed_at, prepared_by, created_at, updated_at) VALUES (?, ?, 1, 0, 10000, 10000, 6980, \'GBP\', ?, ?, ?, 0, 0)',
    id, engagementId, fields.state, fields.proposedAt ?? null, preparer.accountId)
  await rows(`INSERT INTO companies_settlement_lines (id, settlement_id, kind, label, amount_minor, posts, sort, created_at, updated_at) VALUES
    (?, ?, 'company-share', 'Company share, 70%', 7000, 1, 1, 0, 0), (?, ?, 'deposit-kept', 'Deposit kept', -20, 1, 2, 0, 0), (?, ?, 'note', 'Best newcomer award', 0, 0, 3, 0, 0)`,
  newId('cpsl'), id, newId('cpsl'), id, newId('cpsl'), id)
  return id
}

const postings = (id: string) => rows<{ id: string }>('SELECT id FROM finance_postings WHERE idempotency_key = ?', `companies:settlement:${id}:approved`)

beforeAll(async () => {
  for (const id of ['finance', 'payments', 'companies']) await setModule(id, true)
  await setModule('invoicing', false)
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'core.locale.time-zone', 'Europe/London', { reason: 'test', confirm: true })
    await unit.commit()
  })
})

describe('a settlement posts once (CO-03)', () => {
  it('posts one sealed posting however often approval is retried', async () => {
    const id = await settlement({ state: 'agreed' })
    const key = newId('req')
    const first = await req(approver, `/api/companies/settlements/${id}/approve`, key)
    expect(first.status).toBe(200)
    await req(approver, `/api/companies/settlements/${id}/approve`, key)
    expect((await req(approver, `/api/companies/settlements/${id}/approve`)).body.code).toBe('companies.settlement.wrong-state')

    const [posting] = await postings(id)
    expect(await postings(id)).toHaveLength(1)
    expect(first.body.postingId).toBe(posting!.id)
    expect(await rows('SELECT entry_count FROM finance_seals WHERE posting_id = ?', posting!.id)).toEqual([{ entry_count: 4 }])
    const entries = await rows<{ system_key: string, amount_minor: number }>(`SELECT a.system_key, e.amount_minor FROM finance_entries e JOIN finance_accounts a ON a.id = e.account_id
      WHERE e.posting_id = ? ORDER BY a.system_key`, posting!.id)
    expect(entries).toEqual([
      { system_key: 'companies.company-share', amount_minor: 7000 },
      { system_key: 'companies.deposits-held', amount_minor: 20 },
      { system_key: 'companies.other-income', amount_minor: -20 },
      { system_key: 'companies.payable', amount_minor: -7000 },
    ])
    expect(await rows('SELECT state, posting_id FROM companies_settlements WHERE id = ?', id)).toEqual([{ state: 'approved', posting_id: posting!.id }])
    expect(await rows('SELECT name FROM core_events WHERE name = \'companies.settlement.approved\' AND record_id = ?', id)).toHaveLength(1)
  })

  it('posts nothing at approval while Invoices is on, since Invoicing posts when it issues', async () => {
    await setModule('invoicing', true)
    try {
      const id = await settlement({ state: 'agreed' })
      const approved = await req(approver, `/api/companies/settlements/${id}/approve`)
      expect(approved.body).toEqual({ postingId: null })
      expect(await postings(id)).toHaveLength(0)
      expect(await rows('SELECT name FROM core_events WHERE name = \'companies.settlement.approved\' AND record_id = ?', id)).toHaveLength(1)
    }
    finally {
      await setModule('invoicing', false)
    }
  })
})

describe('who may approve, and when (S7)', () => {
  it('refuses a balance other than the one shown, quoting both (M5)', async () => {
    const id = await settlement({ state: 'agreed' })
    const refused = await req(approver, `/api/companies/settlements/${id}/approve`, newId('req'), 7000)
    expect(refused.body).toMatchObject({ code: 'companies.settlement.balance-changed' })
    expect(refused.body.reason).toContain('£69.80')
    expect(refused.body.reason).toContain('£70.00')
  })

  it('refuses the person who prepared it, an owner included', async () => {
    const id = await settlement({ state: 'agreed' })
    expect((await req(preparer, `/api/companies/settlements/${id}/approve`)).body.code).toBe('companies.settlement.own')
    expect(await postings(id)).toHaveLength(0)
  })

  it('waits for the company\'s answer until the setting\'s time has passed since it was proposed', async () => {
    const early = await settlement({ state: 'proposed', proposedAt: Date.now() - DAY })
    expect((await req(approver, `/api/companies/settlements/${early}/approve`)).body.code).toBe('companies.settlement.not-ready')
    const late = await settlement({ state: 'proposed', proposedAt: Date.now() - 15 * DAY })
    expect((await req(approver, `/api/companies/settlements/${late}/approve`)).status).toBe(200)
    const queried = await settlement({ state: 'queried', proposedAt: Date.now() - 15 * DAY })
    expect((await req(approver, `/api/companies/settlements/${queried}/approve`)).body.code).toBe('companies.settlement.wrong-state')
  })
})
