// A student ID not on the list while booking a member ticket (Matt, 19 November): the buyer may ask
// the theatre to check it by hand, which is a membership request in the staff queue; while it waits
// their account has the member price, flagged on the line, and the door checks it again.
import { beforeAll, describe, expect, it } from 'vitest'
import { createUnit, requirements, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import askPost from '../../server/api/box-office/book/ask-check.post'
import orderGet from '../../server/api/box-office/orders/[id]/index.get'
import { createBasket } from '../../server/baskets'
import { applicant, scheme as memberScheme, req as membershipReq } from '../../../membership/tests/integration/stage'
import { house, NOV_16, ready, req, type House } from './stage'

const handle = server({
  'POST /api/box-office/book/ask-check': askPost,
  'GET /api/box-office/orders/:id': orderGet,
})
let keys = 0
async function api<T = any>(method: string, path: string, body: unknown, actor?: ReturnType<typeof person>): Promise<{ status: number, body: T }> {
  const response = await call(handle, method, path, { actor, body, headers: method === 'GET' ? {} : { 'idempotency-key': `ask${++keys}` } })
  return { status: response.status, body: await response.json() as T }
}

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
  await setModule('membership', true)
  await house(1)
})

// The member type takes any membership, so a scheme staged earlier is closed to keep the next one the only one taking requests.
const staged: string[] = []
const FILE = 'Student ID,Ends,Name\n20123456,2027-07-31,Ada Lovelace\n'

/** A scheme people apply to, checked against a list of student IDs, and a priced member ticket. */
async function stage(): Promise<{ h: House, typeId: string, schemeId: string }> {
  for (const id of staged.splice(0)) await membershipReq('POST', `/api/membership/schemes/${id}/state`, { to: 'closed' })
  const made = await membershipReq('POST', '/api/membership/lists', { name: 'Union', keyKind: 'reference', referenceLabel: 'Your student ID', referenceNoun: 'student ID', referenceShape: { kind: 'digits', min: 8, max: 8 } })
  const listId = made.body.listId as string
  expect((await membershipReq('POST', `/api/membership/lists/${listId}/import`, { file: FILE })).status).toBe(200)
  const schemeId = await memberScheme({ acceptsReference: true })
  expect((await membershipReq('PATCH', `/api/membership/schemes/${schemeId}`, { verifier: 'membership.list', listId })).status).toBe(200)
  expect((await membershipReq('POST', `/api/membership/schemes/${schemeId}/state`, { to: 'open' })).status).toBe(200)
  staged.push(schemeId)
  const h = await house(20)
  const types = (await req('GET', '/api/box-office/ticket-types')).body.ticketTypes as { id: string, managedBy: string | null }[]
  const typeId = types.find(t => t.managedBy === 'membership.member')!.id
  expect((await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: typeId, amountMinor: 500 }] })).status).toBe(200)
  return { h, typeId, schemeId }
}

async function buy(h: House, typeId: string, references: string[] | null, actor?: ReturnType<typeof person>) {
  try {
    return await inContext(async () => {
      resetRateLimits()
      const unit = createUnit()
      const made = await createBasket(unit.view(), { performanceId: h.performanceId, lines: [{ bandId: h.bandId, ticketTypeId: typeId, quantity: references?.length ?? 1, ...(references ? { references } : {}) }] })
      await unit.commit()
      return { ok: true as const, orderId: made.orderId }
    }, actor)
  }
  catch (error: any) {
    if (error?.name !== 'Refusal') throw error
    return { ok: false as const, code: error.code as string, fields: error.fields as Record<string, string> | undefined }
  }
}

const ask = (h: House, typeId: string, reference: string, actor?: ReturnType<typeof person>) => {
  resetRateLimits()
  return api('POST', '/api/box-office/book/ask-check', { performanceId: h.performanceId, ticketTypeId: typeId, reference }, actor)
}

describe('a student ID not on the list, while booking', () => {
  it('offers a manual check, which waits in the applications queue and gives the member price meanwhile, flagged', async () => {
    const { h, typeId } = await stage()
    const bea = await applicant('Bea Booking')
    // A well-formed ID the list does not hold can be asked about; a mistyped one cannot.
    expect(await buy(h, typeId, ['20777777'], bea)).toMatchObject({ ok: false, code: 'box-office.requirement.reference-not-met', fields: { reference: 'ask' } })
    expect(await buy(h, typeId, ['2077'], bea)).toMatchObject({ ok: false, fields: { reference: 'not-met' } })

    // Asking needs an account, so the theatre knows whose request it is.
    expect((await ask(h, typeId, '20777777')).status).toBe(401)
    const asked = await ask(h, typeId, '20777777', bea)
    expect(asked.status, JSON.stringify(asked.body)).toBe(200)
    expect(asked.body).toEqual({ state: 'requested' })
    const queued = (await membershipReq('GET', '/api/membership/applications')).body.applications.filter((a: { reference?: string }) => a.reference === '20777777')
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ reason: 'not-on-list' })
    // Asking again does not make a second request.
    expect((await ask(h, typeId, '20777777', bea)).body.state).toMatch(/requested|met/)
    expect((await membershipReq('GET', '/api/membership/applications')).body.applications.filter((a: { reference?: string }) => a.reference === '20777777')).toHaveLength(1)

    // Signed in, the member ticket is now theirs at the member price, flagged as waiting.
    const bought = await buy(h, typeId, null, bea)
    expect(bought.ok, JSON.stringify(bought)).toBe(true)
    const orderId = (bought as { orderId: string }).orderId
    const [line] = await rows<{ amount_minor: number, requirement_evidence_id: string }>('SELECT amount_minor, requirement_evidence_id FROM box_office_order_lines WHERE order_id = ?', orderId)
    expect(line).toEqual({ amount_minor: 500, requirement_evidence_id: `pending:${queued[0].id}` })
    await rows("UPDATE box_office_orders SET state = 'reserved', account_id = ? WHERE id = ? RETURNING id", bea.accountId, orderId)
    const order = await api('GET', `/api/box-office/orders/${orderId}`, undefined, person(['box-office.order.view']))
    expect(order.body.lines[0]).toMatchObject({ requirementPending: true })

    // The door judges the evidence afresh: not met while waiting, met once staff pass it.
    const atDoor = () => inContext(async () => (await requirements.check({ accounts: [null], refs: ['membership:any'], presented: [{ ref: 'membership:any', evidence: line!.requirement_evidence_id }], whenUnavailable: 'met' }))[0])
    expect(await atDoor()).toMatchObject({ verdict: 'not-met', summary: expect.stringContaining('not decided yet') })
    expect((await membershipReq('POST', `/api/membership/applications/${queued[0].id}/decide`, { outcome: 'pass', addToList: true })).body.state).toBe('active')
    expect(await atDoor()).toMatchObject({ verdict: 'met' })
  })

  it('is not met at the door once staff decline it', async () => {
    const { h, typeId } = await stage()
    const cal = await applicant('Cal Declined')
    expect((await ask(h, typeId, '20888888', cal)).body).toEqual({ state: 'requested' })
    const bought = await buy(h, typeId, null, cal)
    expect(bought.ok, JSON.stringify(bought)).toBe(true)
    const [line] = await rows<{ requirement_evidence_id: string }>('SELECT requirement_evidence_id FROM box_office_order_lines WHERE order_id = ?', (bought as { orderId: string }).orderId)
    const membershipId = line!.requirement_evidence_id.slice('pending:'.length)
    expect((await membershipReq('POST', `/api/membership/applications/${membershipId}/decide`, { outcome: 'decline' })).body.state).toBe('declined')
    const answer = await inContext(async () => (await requirements.check({ accounts: [null], refs: ['membership:any'], presented: [{ ref: 'membership:any', evidence: line!.requirement_evidence_id }], whenUnavailable: 'met' }))[0])
    expect(answer).toMatchObject({ verdict: 'not-met' })
    // And the account no longer meets it.
    expect(await buy(h, typeId, null, cal)).toMatchObject({ ok: false, code: 'box-office.requirement.not-met' })
  })

  it('is not taken for an ID that is not well formed, or one already on the list', async () => {
    const { h, typeId } = await stage()
    const di = await applicant('Di Typo')
    expect((await ask(h, typeId, '2099', di)).body).toMatchObject({ code: 'box-office.requirement.ask-not-taken' })
    expect((await ask(h, typeId, '20123456', di)).body).toEqual({ state: 'met' })
    expect((await membershipReq('GET', '/api/membership/applications')).body.applications.filter((a: { reference?: string }) => a.reference === '2099')).toHaveLength(0)
  })
})
