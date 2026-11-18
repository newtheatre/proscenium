// The tickets and booking terms (/policies/tickets): they state the no-show rule with the live
// release time while reserving is possible, and follow the cancellation settings.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit } from '#kit'
import { listPolicies, policyText, resolvePolicy } from '../../../core/server/policies/service'
import { env, inContext, setModule } from '../../../../tests/integration/helpers'

const set = (key: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit.view(), key as never, value as never, { reason: 'test', confirm: true })
  await unit.commit()
})
const text = (id: string) => inContext(async () => policyText((await resolvePolicy(id))!))
const KEYS = ['box-office.reservations.confirm-email', 'box-office.checkout.payment-timing', 'box-office.reservations.release-before', 'box-office.cancellations.by-buyer', 'box-office.cancellations.fee', 'box-office.exchanges.offered']

beforeAll(async () => {
  for (const id of ['finance', 'payments', 'box-office']) await setModule(id, true)
})

afterEach(async () => {
  for (const key of KEYS) await env.DB.prepare('DELETE FROM core_settings WHERE key = ?').bind(key).run()
})

describe('the tickets and booking terms', () => {
  it('are a policy of the box office, agreed to at checkout', async () => {
    const tickets = (await inContext(() => listPolicies())).find(p => p.id === 'tickets')
    expect(tickets).toMatchObject({ title: 'Tickets and booking', kind: 'terms', accepted: 'checkout', module: 'box-office' })
  })

  it('say nothing about reservations while everybody pays when they book', async () => {
    const terms = await text('tickets')
    expect(terms).toContain('You pay in full when you book.')
    expect(terms).not.toContain('If you reserve and do not pay in time')
    expect(await text('visiting')).not.toContain('If you have reserved tickets')
  })

  it('state the no-show rule with the release time in force', async () => {
    await set('box-office.checkout.payment-timing', 'buyer-chooses')
    await set('box-office.reservations.release-before', '20m')
    const terms = await text('tickets')
    expect(terms).toContain('Pay for reserved tickets at least 20 minutes before the performance starts.')
    expect(terms).toContain('We keep your booking if your tickets were released.')
    expect(terms).toContain('We never let in more people than the venue safely holds.')
    expect(terms).toContain('Tickets you have already paid for are never released.')
    expect(await text('visiting')).toContain('pay for them at least 20 minutes before the start')
  })

  it('follow the cancellation and swapping settings', async () => {
    const closed = await text('tickets')
    expect(closed).toContain('we cannot normally refund tickets')
    expect(closed).not.toContain('Swapping.')
    await set('box-office.cancellations.by-buyer', true)
    await set('box-office.cancellations.fee', 150)
    await set('box-office.exchanges.offered', true)
    const open = await text('tickets')
    expect(open).toContain('You can cancel paid tickets up to')
    expect(open).toMatch(/we keep £1\.50 for each ticket/)
    expect(open).toContain('Swapping.')
  })

  it('read whole with nothing set', async () => {
    expect(await text('tickets')).not.toMatch(/ {2}| \.|:setting|:fact|::/)
  })
})

describe('what a buyer agreed to', () => {
  it('keeps on a reservation the terms as they read when it was made', async () => {
    const { buy, house, ready, req, NOV_16 } = await import('./stage')
    const { setClock } = await import('#kit')
    const { rows } = await import('../../../../tests/integration/helpers')
    setClock(NOV_16)
    await ready()
    await set('box-office.reservations.confirm-email', false)
    const h = await house(10)
    const made = await buy(h, 1)
    if (!made.ok) throw new Error(`no basket: ${made.code}`)
    const b = made.basket
    const done = await req('POST', `/api/box-office/baskets/${b.orderId}/reserve`, { expectedTotalMinor: b.totalMinor, email: 'terms@example.org', name: 'Terms Reader' }, null, { 'x-basket-token': b.token })
    expect(done.body.state, JSON.stringify(done.body)).toBe('reserved')
    const [order] = await rows<{ terms_version_id: string | null }>('SELECT terms_version_id FROM box_office_orders WHERE id = ?', b.orderId)
    expect(order!.terms_version_id).toMatch(/^pvn_/)
    const [version] = await rows<{ policy: string, body: string }>('SELECT policy, body FROM core_policy_versions WHERE id = ?', order!.terms_version_id)
    expect(version!.policy).toBe('tickets')
    expect(version!.body).toContain('## The short version')
  })
})
