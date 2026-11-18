// The member price (MEM-35, MEM-58; tab 4, "The requirement source"): a host asks the kit, never
// Membership, whether a buyer meets membership:<scheme> or membership:any. Met by account for a
// current holder; met by a member number typed in place of signing in, only where the scheme accepts
// a reference; judged again from the evidence; and nobody else's membership can be asked about
// without membership.card.check.
import { beforeAll, describe, expect, it } from 'vitest'
import { requirements, setClock } from '#kit'
import { inContext, person, setModule } from '../../../../tests/integration/helpers'
import { NOV_17, ready, req, scheme } from './stage'

beforeAll(ready)

async function openScheme(fields: Record<string, unknown> = {}) {
  const id = await scheme(fields)
  await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
  return id
}
async function addMember(schemeId: string, extra: Record<string, unknown> = {}) {
  const added = await req('POST', `/api/membership/schemes/${schemeId}/members`, { address: `m${Math.random().toString(36).slice(2)}@example.org`, name: 'Grace Hopper', ...extra })
  expect(added.status, JSON.stringify(added.body)).toBe(200)
  return added.body as { membershipId: string, accountId: string, endsOn: string }
}
const numberOf = async (accountId: string) => (await req('GET', '/api/membership/mine', undefined, person([], { accountId }))).body.number.label as string
const check = (actor: ReturnType<typeof person>, request: Parameters<typeof requirements.check>[0]) => inContext(() => requirements.check(request), actor)

describe('the member price', () => {
  it('is met by account for a current holder, with the membership as evidence', async () => {
    const id = await openScheme()
    const m = await addMember(id)
    const holder = person([], { accountId: m.accountId })
    const [own, any] = await check(holder, { accounts: [m.accountId], refs: [`membership:${id}`, 'membership:any'], whenUnavailable: 'not-met' })
    expect(own).toMatchObject({ verdict: 'met', unavailable: false, evidence: m.membershipId })
    expect(any).toMatchObject({ verdict: 'met', evidence: m.membershipId })
    expect(own!.summary).toContain('current until')
    const other = await openScheme()
    expect((await check(holder, { accounts: [m.accountId], refs: [`membership:${other}`], whenUnavailable: 'not-met' }))[0]).toMatchObject({ verdict: 'not-met', reason: 'This price is for members.' })
  })

  it('needs membership.card.check to ask about somebody else, and is withheld while the module is off', async () => {
    const id = await openScheme()
    const m = await addMember(id)
    const seller = person([])
    expect((await check(seller, { accounts: [m.accountId], refs: [`membership:${id}`], whenUnavailable: 'not-met' }))[0]).toMatchObject({ verdict: 'not-met', reason: 'You cannot check this for someone else.' })
    const desk = person(['membership.card.check'])
    expect((await check(desk, { accounts: [m.accountId], refs: [`membership:${id}`], whenUnavailable: 'not-met' }))[0]!.verdict).toBe('met')
    await setModule('membership', false)
    expect((await check(desk, { accounts: [m.accountId], refs: [`membership:${id}`], whenUnavailable: 'not-met' }))[0]).toMatchObject({ verdict: 'not-met', unavailable: true })
    await setModule('membership', true)
  })

  it('takes a member number in place of signing in only where the scheme accepts a reference', async () => {
    const closed = await openScheme()
    const a = await addMember(closed)
    const buyer = person([])
    const typed = (ref: string, value: string) => check(buyer, { accounts: [null], refs: [ref], presented: [{ ref, value }], whenUnavailable: 'not-met' })
    expect((await typed(`membership:${closed}`, await numberOf(a.accountId)))[0]!.verdict).toBe('not-met')

    const open = await openScheme({ acceptsReference: true })
    const b = await addMember(open)
    const number = await numberOf(b.accountId)
    const [met] = await typed(`membership:${open}`, number.toLowerCase())
    expect(met).toMatchObject({ verdict: 'met', evidence: b.membershipId })
    expect(met!.summary).toMatch(/Ask to see the card/)
    // Server-side only: the holder's account for the host's limit, never in JSON.
    expect(met!.holderAccountId).toBe(b.accountId)
    expect(JSON.stringify(met)).not.toContain(b.accountId)

    const [miss] = await typed(`membership:${open}`, '999999')
    expect(miss).toMatchObject({ verdict: 'not-met', reason: expect.stringContaining('could not find') })
    expect((await typed(`membership:${open}`, 'not a number'))[0]!.reason).toContain('not a member number')

    // The evidence is judged afresh: after the membership ends it no longer meets.
    const again = () => check(buyer, { accounts: [null], refs: [`membership:${open}`], presented: [{ ref: `membership:${open}`, evidence: b.membershipId }], whenUnavailable: 'not-met' })
    expect((await again())[0]!.verdict).toBe('met')
    setClock(Date.UTC(2028, 0, 1, 12))
    expect((await again())[0]!.verdict).toBe('not-met')
    setClock(NOV_17)
  })

  it('describes a scheme that accepts a reference with a label that names it, and offers schemes to hosts', async () => {
    const id = await openScheme({ name: 'Friends', key: `friends-${Date.now()}`, side: 'audience', acceptsReference: true })
    const described = await inContext(() => requirements.describe([`membership:${id}`, 'membership:msch_gone']))
    expect(described[`membership:${id}`]).toEqual({ label: 'Friends', presentable: { label: 'Friends: type your member number to get this price', field: 'Member number', shape: 'member-number' } })
    expect(described['membership:msch_gone']!.label).toBe('A membership no longer offered')
    const options = await inContext(() => requirements.options('membership', 'friends'))
    expect(options.map(o => o.reference)).toContain(`membership:${id}`)
  })
})
