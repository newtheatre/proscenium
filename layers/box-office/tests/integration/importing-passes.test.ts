// Bringing in passes from another system with the bookings (server/importing.ts): a pass is issued
// to its holder, paid or still owed, and is found by the code they already hold; a ticket booked
// with it comes in as the pass's entry, confirmed and counted against the pass; the same file again
// changes nothing; and a pass ticket that cannot be had is refused alone, saying why.
import { beforeAll, describe, expect, it } from 'vitest'
import { setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, deliver, inContext, person, rows, server } from '../../../../tests/integration/helpers'
import importPost from '../../server/api/box-office/import/bookings.post'
import typesPost from '../../server/api/box-office/pass-types/index.post'
import { passByCode } from '../../server/pass-holding'
import { ensureManagedTicketTypes } from '../../server/ticket-types'
import { house, NOV_16, ready, type House } from './stage'

const handle = server({ 'POST /api/box-office/import/bookings': importPost, 'POST /api/box-office/pass-types': typesPost })
const importer = person(['box-office.order.import'])
const OLD_PASS = (id: string) => `https://old-theatre.example/passes/pass:${id.padEnd(32, '0')}.s1Gnature-_x${'aB3'.repeat(10)}Q`

let keys = 0
async function post(body: unknown) {
  const response = await call(handle, 'POST', '/api/box-office/import/bookings', { actor: importer, body, headers: { 'idempotency-key': `impp${++keys}` } })
  return { status: response.status, body: await response.json() as any }
}
const one = async <T = Record<string, any>>(sql: string, ...params: unknown[]) => (await rows<T>(sql, ...params))[0]!

let a: House
let b: House
const at = async (h: House) => ({ production: (await one<{ slug: string }>('SELECT slug FROM core_productions WHERE id = ?', h.productionId)).slug, startsAt: (await one<{ starts_at: number }>('SELECT starts_at FROM core_performances WHERE id = ?', h.performanceId)).starts_at })
const pass = (id: string, paid: boolean) => ({ code: OLD_PASS(id), passType: 'Autumn Season Pass', price: 'Member', email: `${id}@example.org`, name: 'Pass Holder', paid })
const booking = async (reference: string, h: House, holder: string, tickets: unknown[]) => ({ reference, email: `${holder}@example.org`, name: 'Pass Holder', ...await at(h), tickets })

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  a = await house(10)
  b = await house(10)
  await inContext(() => ensureManagedTicketTypes())
  const made = await call(handle, 'POST', '/api/box-office/pass-types', { actor: person(['box-office.pass.manage']), headers: { 'idempotency-key': 'impp-type' }, body: { name: 'Autumn Season Pass', covers: 'productions', productionIds: [a.productionId], perShow: 'once', prices: [{ name: 'Member', amountMinor: 2100 }] } })
  expect(made.status, JSON.stringify(await made.clone().json())).toBe(200)
})

describe('importing passes with the bookings', () => {
  it('says what the file would do, with a pass ticket judged against the pass the file brings', async () => {
    const dry = await post({ dryRun: true, passes: [pass('p1', true), { ...pass('p2', false), price: 'Adult' }], bookings: [await booking('PASS01', a, 'p1', [{ pass: OLD_PASS('p1'), amountMinor: 0 }])] })
    expect(dry.status, JSON.stringify(dry.body)).toBe(200)
    expect(dry.body).toMatchObject({ queued: 0, import: 1, passes: { issue: 1, already: 0 } })
    expect(dry.body.passes.refused).toMatchObject([{ code: OLD_PASS('p2'), reason: 'Autumn Season Pass has no price named "Adult".' }])
    expect((await one<{ n: number }>('SELECT count(*) AS n FROM box_office_passes')).n).toBe(0)
  })

  it('issues each pass to its holder and brings its ticket in as the pass\'s entry', async () => {
    const made = await post({ passes: [pass('p1', true), pass('p2', false), { ...pass('p5', true), gift: true }], bookings: [await booking('PASS01', a, 'p1', [{ pass: OLD_PASS('p1'), amountMinor: 0 }, { type: 'Full price', amountMinor: 1000 }]), await booking('PASS02', a, 'p2', [{ pass: OLD_PASS('p2'), amountMinor: 0 }])] })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    expect(made.body).toMatchObject({ queued: 2, passes: { issue: 3 } })
    expect((await deliver()).every(outcome => outcome === 'done')).toBe(true)

    // Found by the code its holder already has, in its holder's name, paid or owed.
    const first = (await inContext(() => passByCode(OLD_PASS('p1'))))!
    const second = (await inContext(() => passByCode(OLD_PASS('p2'))))!
    expect(first).toMatchObject({ name: 'Autumn Season Pass', priceName: 'Member', usesTaken: 1, paidAt: NOV_16 })
    expect(second).toMatchObject({ usesTaken: 1, paidAt: null, amountMinor: 2100 })
    expect(first.accountId).toBeTruthy()
    // Given free in the other system: held at no amount, and owes nothing.
    expect((await inContext(() => passByCode(OLD_PASS('p5'))))!).toMatchObject({ amountMinor: 0, paidAt: NOV_16 })

    // Beside a ticket to pay for, the entry is on a reservation; alone, it is confirmed with its ticket.
    expect(await one('SELECT state, total_minor FROM box_office_orders WHERE reference = ?', 'PASS01')).toEqual({ state: 'reserved', total_minor: 1000 })
    const alone = await one('SELECT id, state, total_minor FROM box_office_orders WHERE reference = ?', 'PASS02')
    expect(alone).toMatchObject({ state: 'confirmed', total_minor: 0 })
    expect(await rows('SELECT l.amount_minor, (l.pass_redemption_id IS NOT NULL) AS entry, t.state FROM box_office_order_lines l JOIN box_office_tickets t ON t.order_line_id = l.id WHERE l.order_id = ?', alone.id)).toEqual([{ amount_minor: 0, entry: 1, state: 'valid' }])
  })

  it('changes nothing a second time, and refuses a pass ticket the pass cannot give', async () => {
    const again = await post({ dryRun: true, passes: [pass('p1', true)], bookings: [await booking('PASS01', a, 'p1', [{ pass: OLD_PASS('p1'), amountMinor: 0 }]), await booking('PASS03', b, 'p1', [{ pass: OLD_PASS('p1'), amountMinor: 0 }]), await booking('PASS04', a, 'p1', [{ pass: OLD_PASS('nobody'), amountMinor: 0 }])] })
    expect(again.body).toMatchObject({ import: 0, already: 1, passes: { issue: 0, already: 1 } })
    expect(again.body.refused.map((r: { reference: string }) => r.reference)).toEqual(['PASS03', 'PASS04'])
    expect(again.body.refused[0].reason).toContain('does not cover')
    expect((await inContext(() => passByCode(OLD_PASS('p1'))))!.usesTaken).toBe(1)
  })
})
