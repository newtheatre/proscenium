// The membership card (MEM-51): Box office signs a `mem` code for the holder's own membership, and
// its door shows whether the membership is current, admitting nobody and writing no scan row.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setClock } from '#kit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import doorCodeGet from '../../../box-office/server/api/box-office/door-codes/[kind]/[subject].get'
import { scan } from '../../../box-office/server/door'
import { NOV_17, applicant, ready, req, scheme } from './stage'

const boxOffice = server({ 'GET /api/box-office/door-codes/:kind/:subject': doorCodeGet })
const cardOf = async (membershipId: string, who: ReturnType<typeof person>) => {
  const response = await call(boxOffice, 'GET', `/api/box-office/door-codes/mem/${membershipId}`, { actor: who })
  return { status: response.status, body: await response.json() as { doorCode?: string, code?: string } }
}
const steward = person(['membership.card.check', 'box-office.ticket.admit'])
const scanned = (code: string, actor = steward) => inContext(() => scan({ performanceId: 'perf_none', code }), actor)

beforeAll(async () => {
  await ready()
  await setModule('box-office', true)
})
afterAll(() => setClock(NOV_17))

describe('membership card', () => {
  it('is signed for the holder only, and a scan says whether it is current without admitting anybody', async () => {
    const id = await scheme({ graceDays: 10 })
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const who = await applicant('Card Holder')
    const joined = (await req('POST', `/api/membership/schemes/${id}/join`, {}, who)).body
    expect((await req('GET', '/api/membership/mine', undefined, who)).body.card).toBe(true)

    const card = await cardOf(joined.membershipId, who)
    expect(card.status, JSON.stringify(card.body)).toBe(200)
    expect(card.body.doorCode).toMatch(/^mem\.[^.]+\.[^.]+\.[^.]+$/)
    expect((await cardOf(joined.membershipId, await applicant('Somebody Else'))).status).toBe(404)
    expect((await call(boxOffice, 'GET', `/api/box-office/door-codes/xyz/${joined.membershipId}`, { actor: who })).status).toBe(404)

    const before = (await rows<{ n: number }>('SELECT count(*) AS n FROM box_office_scans'))[0]!.n
    const current = await scanned(card.body.doorCode!)
    expect(current).toMatchObject({ result: 'card', scanId: null, card: { kind: 'mem', headline: 'Member', state: 'ok' } })
    expect(current.card!.line).toContain('current until 2027-11-16')
    expect(current.card!.line).not.toContain('Card Holder')
    expect((await scanned(card.body.doorCode!, person(['box-office.ticket.admit']))).result).toBe('card_not_allowed')
    const forged = card.body.doorCode!.replace(/\.[^.]+$/, '.AAAA')
    expect((await scanned(forged)).result).toBe('bad_signature')

    setClock(Date.parse('2027-11-20T12:00:00Z'))
    expect((await scanned(card.body.doorCode!)).card).toMatchObject({ headline: 'Member, in grace', state: 'attention' })
    setClock(Date.parse('2027-12-01T12:00:00Z'))
    expect((await scanned(card.body.doorCode!)).card).toMatchObject({ headline: 'Membership ended', state: 'attention' })
    expect((await cardOf(joined.membershipId, who)).status).toBe(404)
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM box_office_scans'))[0]!.n).toBe(before)
    // Not four parts: an unknown code, as before.
    expect((await scanned('mem.key.code')).result).toBe('unknown')
  })
})
