// The people who hold a pass (BO-64): staff give a pass by hand, see who holds each and what it has
// booked, move it to another person, cancel it and bring it back, and mark it paid; its holder sees
// it in My passes; and a pass scanned at the door is said to be a pass, not a ticket.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import typesPost from '../../server/api/box-office/pass-types/index.post'
import holdersGet from '../../server/api/box-office/pass-types/[id]/passes.get'
import givePost from '../../server/api/box-office/pass-types/[id]/passes.post'
import passGet from '../../server/api/box-office/passes/[id]/index.get'
import passPost from '../../server/api/box-office/passes/[id]/index.post'
import mineGet from '../../server/api/box-office/passes/mine.get'
import myPassesCount from '../../server/contributions/core.count/my-passes'
import { createBasket } from '../../server/baskets'
import { scan } from '../../server/door'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { house, NOV_16, ready, type House } from './stage'

const handle = server({
  'POST /api/box-office/pass-types': typesPost, 'GET /api/box-office/pass-types/:id/passes': holdersGet, 'POST /api/box-office/pass-types/:id/passes': givePost,
  'GET /api/box-office/passes/mine': mineGet, 'GET /api/box-office/passes/:id': passGet, 'POST /api/box-office/passes/:id': passPost,
})
const staff = person(['box-office.pass.manage'])
const holder = person([])
const friend = person([])
const recipient = person([])
let keys = 0
async function api(method: string, path: string, body?: unknown, actor: ReturnType<typeof person> = staff) {
  const response = await call(handle, method, path, { actor, body, headers: { 'idempotency-key': `ph${++keys}` } })
  return { status: response.status, body: await response.json() as any }
}

let a: House
let typeId: string
let priceId: string
let passId: string
let code: string

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  a = await house(10)
  await inContext(() => ensureManagedTicketTypes())
  const made = await api('POST', '/api/box-office/pass-types', { name: 'Season Pass', covers: 'productions', productionIds: [a.productionId], perShow: 'once', prices: [{ name: 'Adult', amountMinor: 3500 }] })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  typeId = made.body.id
  priceId = (await rows<{ id: string }>('SELECT id FROM box_office_pass_prices WHERE pass_type_id = ?', typeId))[0]!.id
})

describe('the people who hold a pass', () => {
  it('is given by hand to a person, who is sent its code and sees it in My passes', async () => {
    const given = await api('POST', `/api/box-office/pass-types/${typeId}/passes`, { passPriceId: priceId, accountId: holder.accountId })
    expect(given.status, JSON.stringify(given.body)).toBe(200)
    passId = given.body.id
    code = given.body.code
    expect(code).toMatch(/^PASS-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect((await rows('SELECT type_key FROM core_notifications WHERE subject_id = ?', passId)).map((r: any) => r.type_key)).toEqual(['box-office.pass-issued'])
    const mine = await api('GET', '/api/box-office/passes/mine', undefined, holder)
    expect(mine.body.passes).toMatchObject([{ id: passId, name: 'Season Pass', priceName: 'Adult', code, owedMinor: 3500, entries: [], open: [{ productionId: a.productionId }] }])
    expect((await api('GET', '/api/box-office/passes/mine', undefined, friend)).body.passes).toEqual([])
    // My account lists Passes only for somebody who holds one.
    expect(await inContext(() => myPassesCount.value(holder))).toBe(1)
    expect(await inContext(() => myPassesCount.value(friend))).toBe(0)
    expect((await api('GET', `/api/box-office/pass-types/${typeId}/passes`, undefined, holder)).status).toBe(403)
  })

  it('given as a gift is held at no amount and owes nothing, unlike one paid some other way', async () => {
    const other = await api('POST', '/api/box-office/pass-types', { name: 'Gift Pass', covers: 'productions', productionIds: [a.productionId], perShow: 'once', prices: [{ name: 'Adult', amountMinor: 3500 }] })
    const otherPrice = (await rows<{ id: string }>('SELECT id FROM box_office_pass_prices WHERE pass_type_id = ?', other.body.id))[0]!.id
    const gift = await api('POST', `/api/box-office/pass-types/${other.body.id}/passes`, { passPriceId: otherPrice, accountId: recipient.accountId, gift: true })
    expect(gift.status, JSON.stringify(gift.body)).toBe(200)
    const paid = await api('POST', `/api/box-office/pass-types/${other.body.id}/passes`, { passPriceId: otherPrice, accountId: recipient.accountId, settled: true })
    const held = (await api('GET', `/api/box-office/pass-types/${other.body.id}/passes`)).body.rows
    expect(held.find((r: any) => r.id === gift.body.id)).toMatchObject({ amountMinor: 0, paidAt: NOV_16 })
    expect(held.find((r: any) => r.id === paid.body.id)).toMatchObject({ amountMinor: 3500, paidAt: NOV_16 })
    expect((await api('GET', '/api/box-office/passes/mine', undefined, recipient)).body.passes.map((p: any) => p.owedMinor)).toEqual([0, 0])
  })

  it('is listed for staff with what it has booked, and marked paid by hand', async () => {
    await inContext(async () => {
      const unit = createUnit()
      await createBasket(unit.view(), { performanceId: a.performanceId, lines: [], passes: [{ code }] })
      await unit.commit()
    }, holder)
    // A basket is not a booking yet.
    expect((await api('GET', `/api/box-office/pass-types/${typeId}/passes`)).body.rows).toMatchObject([{ id: passId, entries: 0, paidAt: null, state: 'active' }])
    expect((await api('POST', `/api/box-office/passes/${passId}`, { action: 'settle' })).status).toBe(200)
    expect((await api('GET', `/api/box-office/passes/${passId}`)).body.pass).toMatchObject({ paidAt: NOV_16, code })
    expect((await api('POST', `/api/box-office/passes/${passId}`, { action: 'settle' })).status).toBe(409)
  })

  it('is moved to another person, cancelled and brought back', async () => {
    expect((await api('POST', `/api/box-office/passes/${passId}`, { action: 'move', accountId: friend.accountId })).status).toBe(200)
    expect((await api('GET', '/api/box-office/passes/mine', undefined, friend)).body.passes).toHaveLength(1)
    expect((await api('GET', '/api/box-office/passes/mine', undefined, holder)).body.passes).toEqual([])
    expect((await api('POST', `/api/box-office/passes/${passId}`, { action: 'cancel' })).status).toBe(200)
    expect((await api('GET', '/api/box-office/passes/mine', undefined, friend)).body.passes[0].state).toBe('void')
    expect((await api('POST', `/api/box-office/passes/${passId}`, { action: 'restore' })).status).toBe(200)
    expect((await api('POST', `/api/box-office/passes/${passId}`, { action: 'send' })).body).toMatchObject({ sent: true })
  })

  it('scanned at the door is said to be a pass, not a ticket, and nothing is recorded', async () => {
    const out = await inContext(() => scan({ performanceId: a.performanceId, code }), person(['box-office.ticket.admit']))
    expect(out).toMatchObject({ result: 'pass', scanId: null })
  })
})
