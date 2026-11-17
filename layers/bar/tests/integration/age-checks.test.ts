// The age check and the refusals register (BAR-18, BAR-44's signature; tests T-N7, T-I13, part of
// T-I29): a restricted sale cannot start its payment unanswered, the answer is logged once per sale,
// a refusal needs a reason and may have no sale, the description is refused while the setting is off
// and never reaches the audit log, and a signature records the refusals it covered.
import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import { ensureVocabularies } from '../../../core/server/vocabularies/service'
import { openSession } from '../../../payments/server/services'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import tillSalePost from '../../../payments/server/api/payments/till/sale.post'
import refusalsPost from '../../server/api/bar/age-checks/refusals.post'
import registerGet from '../../server/api/bar/age-checks/index.get'
import reviewPost from '../../server/api/bar/age-checks/review.post'
import erasePost from '../../server/api/bar/age-checks/[id]/erase-description.post'
import standardListener from '../../server/listeners/standard-price-list'
import { addCategory, addOutlet, addProduct } from '../../server/catalogue'

const NOW = Date.UTC(2026, 10, 17, 20) // not-policy: a test's moment
const handle = server({
  'POST /api/payments/till/sale': tillSalePost,
  'POST /api/bar/age-checks/refusals': refusalsPost,
  'GET /api/bar/age-checks': registerGet,
  'POST /api/bar/age-checks/review': reviewPost,
  'POST /api/bar/age-checks/:id/erase-description': erasePost,
})
const seller = person(['payments.session.open', 'bar.sale.sell'], { reassertedAt: NOW })
const manager = person(['bar.age-check.review'], { reassertedAt: NOW })

async function commit<T>(fn: (unit: ReturnType<typeof createUnit>) => Promise<T>): Promise<T> {
  return inContext(async () => {
    const unit = createUnit()
    const out = await fn(unit)
    await unit.commit()
    return out
  })
}
async function send(method: string, path: string, body: unknown, actor = seller) {
  const response = await call(handle, method, path, { actor, body: method === 'GET' ? undefined : body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as any }
}
const post = (path: string, body: unknown, actor = seller) => send('POST', path, body, actor)

const stock = { outlet: '', wine: '', crisps: '', reason: '' }
const till = (key: string, lines: [string, number][], total: number, ageCheck?: string) =>
  post('/api/payments/till/sale', { panels: [{ basket: 'bar', input: { outletId: stock.outlet, clientKey: key, lines: lines.map(([variantId, quantity]) => ({ variantId, quantity })), expectedTotalMinor: total, ...(ageCheck ? { ageCheck } : {}) } }] })
const checks = () => rows<{ outcome: string, sale_id: string | null, variant_id: string | null, refusal_term: string | null, description: string | null }>('SELECT outcome, sale_id, variant_id, refusal_term, description FROM bar_age_checks ORDER BY at, id')
const setSetting = (key: string, value: unknown) => commit(unit => changeSetting(unit.view(), key as never, value, { reason: 'test', confirm: true }))

beforeAll(async () => {
  setClock(NOW)
  for (const id of ['finance', 'payments', 'bar']) await setModule(id, true)
  await commit(async (unit) => {
    await standardListener({ payload: { moduleId: 'bar' } } as any, unit.view())
  })
  await commit(async (unit) => {
    const v = unit.view()
    const categoryId = addCategory(v, { name: 'Checks wine' })
    stock.wine = (await addProduct(v, { categoryId, name: 'Checks red', ageRestricted: true }, { name: '175ml', amountMinor: 600 }, seller.accountId!)).variantId
    stock.crisps = (await addProduct(v, { categoryId, name: 'Checks crisps' }, { amountMinor: 120 }, seller.accountId!)).variantId
    stock.outlet = addOutlet(v, { name: 'Checks bar', kind: 'bar' })
  })
  await setSetting('core.locale.time-zone', 'Europe/London')
  await commit(unit => openSession(unit.view(), { accountId: seller.accountId!, pointLabel: 'Bar', floatMinor: 0 }))
  await inContext(() => ensureVocabularies('bar'))
  stock.reason = (await rows<{ id: string }>("SELECT id FROM core_terms WHERE vocabulary_key = 'bar.refusal-reason' AND slug = 'no-id'"))[0]!.id
})

describe('the age check', () => {
  it('refuses to start payment for a restricted line until the check is answered (T-N7)', async () => {
    const unanswered = await till('age-1-xxxxxxxxx', [[stock.wine, 1]], 600)
    expect(unanswered.body.code).toBe('bar.age-check.unanswered')
    expect(await rows('SELECT count(*) AS n FROM bar_sales WHERE client_key = ?', 'age-1-xxxxxxxxx')).toEqual([{ n: 0 }])

    // An unrestricted basket needs no answer.
    expect((await till('age-2-xxxxxxxxx', [[stock.crisps, 1]], 120)).status).toBe(200)
  })

  it('logs the answer once per sale, with the product that needed it', async () => {
    const answered = await till('age-3-xxxxxxxxx', [[stock.crisps, 1], [stock.wine, 2]], 1320, 'id_checked')
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    const sale = (await rows<{ id: string }>('SELECT id FROM bar_sales WHERE client_key = ?', 'age-3-xxxxxxxxx'))[0]!.id
    expect((await checks()).filter(c => c.sale_id === sale)).toEqual([{ outcome: 'id_checked', sale_id: sale, variant_id: stock.wine, refusal_term: null, description: null }])
  })

  it('asks nothing when the theatre has switched the check off', async () => {
    await setSetting('bar.age-check.enabled', false)
    expect((await till('age-4-xxxxxxxxx', [[stock.wine, 1]], 600)).status).toBe(200)
    expect(await rows('SELECT count(*) AS n FROM bar_age_checks a JOIN bar_sales s ON s.id = a.sale_id WHERE s.client_key = ?', 'age-4-xxxxxxxxx')).toEqual([{ n: 0 }])
    expect((await post('/api/bar/age-checks/refusals', { outletId: stock.outlet, reasonTermId: stock.reason })).body.code).toBe('bar.age-check.off')
    await setSetting('bar.age-check.enabled', true)
  })
})

describe('refusals', () => {
  it('needs a reason from the list, and records the product refused, with or without a sale (T-I13)', async () => {
    expect((await post('/api/bar/age-checks/refusals', { outletId: stock.outlet, variantId: stock.wine })).status).toBe(422)
    expect((await post('/api/bar/age-checks/refusals', { outletId: stock.outlet, reasonTermId: 'term_nope' })).body.code).toBe('bar.age-check.bad-reason')

    const withProduct = await post('/api/bar/age-checks/refusals', { outletId: stock.outlet, variantId: stock.wine, reasonTermId: stock.reason })
    expect(withProduct.status, JSON.stringify(withProduct.body)).toBe(200)
    const noProduct = await post('/api/bar/age-checks/refusals', { outletId: stock.outlet, reasonTermId: stock.reason })
    expect(noProduct.status).toBe(200)
    const refused = (await checks()).filter(c => c.outcome === 'refused')
    expect(refused).toEqual([
      { outcome: 'refused', sale_id: null, variant_id: stock.wine, refusal_term: stock.reason, description: null },
      { outcome: 'refused', sale_id: null, variant_id: null, refusal_term: stock.reason, description: null },
    ])
    expect(await rows('SELECT count(*) AS n FROM core_events WHERE name = ?', 'bar.age-check.refused')).toEqual([{ n: 2 }])
  })

  it('refuses a description while the setting is off, and keeps it out of the audit log when on', async () => {
    const words = 'Red coat, tall, short dark hair'
    expect((await post('/api/bar/age-checks/refusals', { outletId: stock.outlet, reasonTermId: stock.reason, description: words })).body.code).toBe('bar.age-check.description-off')

    await setSetting('bar.age-check.description', true)
    expect((await post('/api/bar/age-checks/refusals', { outletId: stock.outlet, reasonTermId: stock.reason, description: 'x'.repeat(121) })).status).toBe(422)
    const described = await post('/api/bar/age-checks/refusals', { outletId: stock.outlet, reasonTermId: stock.reason, description: words })
    expect(described.status, JSON.stringify(described.body)).toBe(200)
    expect((await checks()).some(c => c.description === words)).toBe(true)
    const audit = await rows<{ detail: string | null }>('SELECT detail FROM core_audit WHERE record_id = ?', described.body.id)
    expect(audit.length).toBeGreaterThan(0)
    expect(JSON.stringify(audit)).not.toContain('Red coat')
    const events = await rows<{ payload: string }>("SELECT payload FROM core_events WHERE name = 'bar.age-check.refused'")
    expect(JSON.stringify(events)).not.toContain('Red coat')

    // A reviewer erases it; the row stays, and the words go.
    const erased = await post(`/api/bar/age-checks/${described.body.id}/erase-description`, {}, manager)
    expect(erased.status, JSON.stringify(erased.body)).toBe(200)
    expect(await rows('SELECT description FROM bar_age_checks WHERE id = ?', described.body.id)).toEqual([{ description: null }])
    expect((await post(`/api/bar/age-checks/${described.body.id}/erase-description`, {}, manager)).body.code).toBe('bar.age-check.nothing-to-erase')
    expect((await post(`/api/bar/age-checks/${described.body.id}/erase-description`, {}, seller)).status).toBe(403)
  })

  it('cannot be changed or deleted in the database', async () => {
    const id = (await rows<{ id: string }>("SELECT id FROM bar_age_checks WHERE outcome = 'refused' LIMIT 1"))[0]!.id
    await expect(env.DB.prepare("UPDATE bar_age_checks SET outcome = 'not_needed', refusal_term = NULL WHERE id = ?").bind(id).run()).rejects.toThrow(/append-only/)
    await expect(env.DB.prepare('DELETE FROM bar_age_checks WHERE id = ?').bind(id).run()).rejects.toThrow(/append-only/)
  })
})

describe('the register', () => {
  it('lists the rows for someone who may read it, and a signature records the refusals it covered', async () => {
    expect((await send('GET', '/api/bar/age-checks', undefined)).status).toBe(403)
    const listed = await send('GET', '/api/bar/age-checks?outcome=refused', undefined, manager)
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    expect(listed.body.rows.length).toBe(3)
    expect(listed.body.rows.every((r: any) => r.outcome === 'refused' && r.reason === 'No ID' && r.outlet === 'Checks bar')).toBe(true)
    expect(listed.body.canReview).toBe(true)

    expect((await post('/api/bar/age-checks/review', { fromDay: '2026-11-17', toDay: '2026-11-18' }, manager)).body.code).toBe('bar.age-check.future')
    expect((await post('/api/bar/age-checks/review', { fromDay: '2026-11-17', toDay: '2026-11-17' }, seller)).status).toBe(403)
    const signed = await post('/api/bar/age-checks/review', { fromDay: '2026-11-17', toDay: '2026-11-17' }, manager)
    expect(signed.status, JSON.stringify(signed.body)).toBe(200)
    expect(signed.body.refusals).toBe(3)
    expect((await send('GET', '/api/bar/age-checks', undefined, manager)).body.reviews).toMatchObject([{ fromDay: '2026-11-17', toDay: '2026-11-17', refusals: 3 }])
  })
})
