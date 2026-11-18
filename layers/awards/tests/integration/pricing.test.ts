// The price an award carries: a holder meets awards:<type> and awards:benefit by account, one ticket
// each, with the award as evidence; nobody else's award can be asked about without
// awards.award.check; and the holder's card is signed by Box office and read at its door.
import { beforeAll, describe, expect, it } from 'vitest'
import { requirements } from '#kit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import doorCodeGet from '../../../box-office/server/api/box-office/door-codes/[kind]/[subject].get'
import { scan } from '../../../box-office/server/door'
import { awardType, holder, issue, ready, req } from './stage'

const check = (actor: ReturnType<typeof person>, request: Parameters<typeof requirements.check>[0]) => inContext(() => requirements.check(request), actor)
const boxOffice = server({ 'GET /api/box-office/door-codes/:kind/:subject': doorCodeGet })
const cardOf = async (awardId: string, who: ReturnType<typeof person>) => {
  const response = await call(boxOffice, 'GET', `/api/box-office/door-codes/awd/${awardId}`, { actor: who })
  return { status: response.status, body: await response.json() as { doorCode?: string } }
}
const steward = person(['awards.award.check', 'box-office.ticket.admit'])
const scanned = (code: string, actor = steward) => inContext(() => scan({ performanceId: 'perf_none', code }), actor)

beforeAll(async () => {
  await ready()
  await setModule('box-office', true)
})

describe('the fellow\'s price', () => {
  it('is met by account for a current holder, one ticket, and ends when the award is revoked', async () => {
    const fellowship = await awardType({ name: 'Pricing Fellowship', givesTicketBenefit: true })
    const commendation = await awardType({ name: 'Pricing Commendation' })
    const fellow = await holder('A Fellow')
    const commended = await holder('Somebody Commended')
    const id = await issue(fellowship, { accountId: fellow.accountId })
    await issue(commendation, { accountId: commended.accountId })

    const [own, any] = await check(fellow, { accounts: [fellow.accountId!], refs: [`awards:${fellowship}`, 'awards:benefit'], whenUnavailable: 'not-met' })
    expect(own).toMatchObject({ verdict: 'met', unavailable: false, evidence: id, quantity: 1 })
    expect(any).toMatchObject({ verdict: 'met', evidence: id })
    const [other, benefit] = await check(commended, { accounts: [commended.accountId!], refs: [`awards:${commendation}`, 'awards:benefit'], whenUnavailable: 'not-met' })
    expect(other!.verdict).toBe('met')
    // The reason names the awards that qualify, never the commendation the person holds.
    expect(benefit).toMatchObject({ verdict: 'not-met' })
    expect(benefit!.reason).toMatch(/^This price is for holders of .*Pricing Fellowship.*\.$/)
    expect(benefit!.reason).not.toContain('Pricing Commendation')

    expect((await req('POST', `/api/awards/awards/${id}/revoke`, { reason: 'Issued in error' })).status).toBe(200)
    expect((await check(fellow, { accounts: [fellow.accountId!], refs: ['awards:benefit'], whenUnavailable: 'not-met' }))[0]!.verdict).toBe('not-met')
  })

  it('needs awards.award.check to ask about somebody else, and is withheld while the module is off', async () => {
    const fellowship = await awardType({ givesTicketBenefit: true })
    const fellow = await holder('Another Fellow')
    await issue(fellowship, { accountId: fellow.accountId })
    const request = { accounts: [fellow.accountId!], refs: ['awards:benefit'], whenUnavailable: 'not-met' as const }
    expect((await check(person([]), request))[0]).toMatchObject({ verdict: 'not-met', notAllowed: true })
    const desk = person(['awards.award.check'])
    expect((await check(desk, request))[0]!.verdict).toBe('met')
    await setModule('awards', false)
    expect((await check(desk, request))[0]).toMatchObject({ verdict: 'not-met', unavailable: true })
    await setModule('awards', true)
  })

  it('names its references for the picker and for a ticket type', async () => {
    const fellowship = await awardType({ name: 'Honorary Fellowship', givesTicketBenefit: true })
    const options = await inContext(() => requirements.options('awards', 'honorary'))
    expect(options).toEqual([{ reference: `awards:${fellowship}`, label: 'Honorary Fellowship', description: undefined }])
    const described = await inContext(() => requirements.describe([`awards:${fellowship}`, 'awards:benefit', 'awards:awt_gone']))
    expect(described).toMatchObject({ [`awards:${fellowship}`]: { label: 'Honorary Fellowship' }, 'awards:benefit': { label: 'Award holders' }, 'awards:awt_gone': { label: 'An award no longer given' } })
  })
})

describe('the holder\'s card', () => {
  it('is signed for the holder of an award that carries a ticket price, and a scan admits nobody', async () => {
    const fellowship = await awardType({ name: 'Fellowship of the theatre', givesTicketBenefit: true })
    const commendation = await awardType()
    const fellow = await holder('Card Holder')
    const id = await issue(fellowship, { accountId: fellow.accountId })
    const plain = await issue(commendation, { accountId: fellow.accountId })
    expect((await req('GET', '/api/awards/mine', undefined, fellow)).body.awards.map((a: any) => [a.id, a.card])).toEqual(expect.arrayContaining([[id, true], [plain, false]]))

    const card = await cardOf(id, fellow)
    expect(card.status, JSON.stringify(card.body)).toBe(200)
    expect(card.body.doorCode).toMatch(/^awd\.[^.]+\.[^.]+\.[^.]+$/)
    expect((await cardOf(plain, fellow)).status).toBe(404)
    expect((await cardOf(id, await holder('Somebody Else'))).status).toBe(404)

    const before = (await rows<{ n: number }>('SELECT count(*) AS n FROM box_office_scans'))[0]!.n
    const current = await scanned(card.body.doorCode!)
    expect(current).toMatchObject({ result: 'card', scanId: null, card: { kind: 'awd', headline: 'Fellowship of the theatre', state: 'ok' } })
    expect(current.card!.line).not.toContain('Card Holder')
    expect((await scanned(card.body.doorCode!, person(['box-office.ticket.admit']))).result).toBe('card_not_allowed')

    await req('POST', `/api/awards/awards/${id}/revoke`, { reason: 'Issued in error' })
    expect((await scanned(card.body.doorCode!)).card).toMatchObject({ headline: 'Award revoked', state: 'attention' })
    expect((await cardOf(id, fellow)).status).toBe(404)
    expect((await rows<{ n: number }>('SELECT count(*) AS n FROM box_office_scans'))[0]!.n).toBe(before)
  })
})
