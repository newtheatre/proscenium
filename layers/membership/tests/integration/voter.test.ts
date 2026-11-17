// The voting fact (MEM-09; test voter-qualifying-period): membership.voter holds for a current
// membership of a voting scheme once the qualifying period has passed since it was activated, never
// for a scheme not marked voting, and renewing does not start the period again.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changeSetting, createUnit, setClock } from '#kit'
import { inContext } from '../../../../tests/integration/helpers'
import { voters } from '../../server/memberships'
import { NOV_17, applicant, holds, ready, req, scheme } from './stage'

const DAY = 86_400_000

async function open(fields: Record<string, unknown>) {
  const id = await scheme({ renewalOpensDays: 30, ...fields })
  expect((await req('PATCH', `/api/membership/schemes/${id}`, fields)).status).toBe(200)
  expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
  return id
}

beforeAll(async () => {
  await ready()
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), 'membership.voting.qualifying-period', '30d', { reason: 'test', confirm: true })
    await unit.commit()
  })
})
afterAll(() => setClock(NOV_17))

describe('membership.voter', () => {
  it('holds once the qualifying period has passed, and never for a scheme not marked voting', async () => {
    const voting = await open({ voting: true })
    const plain = await open({ voting: false })
    const member = await applicant('Voting Member')
    const other = await applicant('Non Voting Member')
    expect((await req('POST', `/api/membership/schemes/${voting}/join`, {}, member)).status).toBe(200)
    expect((await req('POST', `/api/membership/schemes/${plain}/join`, {}, other)).status).toBe(200)
    expect(await holds(member.accountId!, 'membership.voter')).toBe(false)

    setClock(NOV_17 + 31 * DAY)
    expect(await holds(member.accountId!, 'membership.voter')).toBe(true)
    expect(await holds(other.accountId!, 'membership.voter')).toBe(false)
    const everyone = await inContext(() => voters())
    expect(everyone).toContain(member.accountId)
    expect(everyone).not.toContain(other.accountId)
    setClock(NOV_17)
  })

  it('keeps counting from the first membership through a renewal', async () => {
    const voting = await open({ voting: true })
    const member = await applicant('Renewing Voter')
    const first = (await req('POST', `/api/membership/schemes/${voting}/join`, {}, member)).body.membershipId as string
    setClock(Date.parse('2027-11-01T12:00:00Z'))
    const renewed = await req('POST', `/api/membership/mine/${first}/renew`, {}, member)
    expect(renewed.status, JSON.stringify(renewed.body)).toBe(200)
    // The first membership has ended and the renewal has just begun: the period still counts from the first.
    setClock(Date.parse('2027-11-20T12:00:00Z'))
    expect(await holds(member.accountId!, 'membership.voter')).toBe(true)
    setClock(NOV_17)
  })
})
