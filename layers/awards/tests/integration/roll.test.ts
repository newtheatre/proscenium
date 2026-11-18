// The roll of honour: listed, current awards by type, for anybody; members-only awards for somebody
// with a members' standing; nothing while the roll is not public. And an award recorded by name
// alone is linked to an account once, after which it is theirs.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { changeSetting, createUnit } from '#kit'
import * as standings from '../../../core/server/identity/standings'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { awardType, holder, issue, NOV_17, ready, req } from './stage'

beforeAll(ready)

const set = (name: string, value: unknown) => inContext(async () => {
  const unit = createUnit()
  await changeSetting(unit.view(), name, value, { reason: 'test', confirm: true })
  await unit.commit()
})
const namesOn = async (key: string, actor: ReturnType<typeof person> | null = null) => ((await req('GET', `/api/awards/roll?type=${key}`, undefined, actor)).body.types[0]?.awards ?? []).map((a: any) => a.name)

describe('the roll of honour', () => {
  it('lists current public awards by type to anybody, newest first, and never a hidden or revoked one', async () => {
    const type = await awardType({ key: 'roll-fellowship', name: 'Fellowship', summary: 'For long service.' })
    await issue(type, { recipientName: 'Peggy Ashcroft', awardedOn: '1998-06-01', citation: 'For forty years.' })
    await issue(type, { recipientName: 'Ellen Terry', awardedOn: '2004-06-01', awardedFor: 'Wardrobe' })
    const hidden = await issue(type, { recipientName: 'Hidden Holder' })
    await req('PATCH', `/api/awards/awards/${hidden}`, { visibility: 'hidden' })
    const revoked = await issue(type, { recipientName: 'Revoked Holder' })
    await req('POST', `/api/awards/awards/${revoked}/revoke`, { reason: 'Issued in error' })

    const { status, body } = await req('GET', '/api/awards/roll?type=roll-fellowship', undefined, null)
    expect(status).toBe(200)
    expect(body.types).toMatchObject([{ key: 'roll-fellowship', name: 'Fellowship', summary: 'For long service.' }])
    expect(body.types[0].awards).toMatchObject([
      { name: 'Ellen Terry', awardedOn: '2004-06-01', awardedFor: 'Wardrobe', production: null },
      { name: 'Peggy Ashcroft', awardedOn: '1998-06-01', citation: 'For forty years.' },
    ])
    expect(JSON.stringify(body)).not.toMatch(/decision|accountId/)
    expect((await req('GET', '/api/awards/roll', undefined, null)).body.types.some((t: any) => t.key === 'roll-fellowship')).toBe(true)
  })

  it('shows a members-only award to somebody with a members\' standing alone', async () => {
    const type = await awardType({ key: 'roll-members', defaultVisibility: 'members' })
    await issue(type, { recipientName: 'Quiet Holder' })
    expect(await namesOn('roll-members')).toEqual([])
    expect(await namesOn('roll-members', await holder('An Audience Member'))).toEqual([])
    const member = await holder('A Member')
    const spy = vi.spyOn(standings, 'hasStanding').mockImplementation(async actor => actor.accountId === member.accountId)
    expect(await namesOn('roll-members', member)).toEqual(['Quiet Holder'])
    spy.mockRestore()
  })

  it('answers "not found" while the roll is not public', async () => {
    await set('awards.roll.public', false)
    expect((await req('GET', '/api/awards/roll', undefined, null)).status).toBe(404)
    await set('awards.roll.public', true)
  })
})

describe('linking an account', () => {
  it('gives a name-only award its account once, and never a second of a once-only award', async () => {
    const type = await awardType({ givesTicketBenefit: true })
    const past = await issue(type, { recipientName: 'Sybil Thorndike', awardedOn: '1990-06-01' })
    const sybil = await holder('Sybil Thorndike')
    expect((await req('GET', '/api/awards/mine', undefined, sybil)).body.awards).toEqual([])
    expect((await req('POST', `/api/awards/awards/${past}/link`, {})).status).toBe(422)
    expect((await req('POST', `/api/awards/awards/${past}/link`, { accountId: sybil.accountId })).body).toMatchObject({ accountId: sybil.accountId })
    expect((await req('GET', '/api/awards/mine', undefined, sybil)).body.awards).toMatchObject([{ id: past, card: true }])
    expect((await req('POST', `/api/awards/awards/${past}/link`, { accountId: (await holder('Another')).accountId })).body.code).toBe('awards.award.not-linkable')

    const second = await issue(type, { recipientName: 'S. Thorndike', awardedOn: '1991-06-01' })
    const refused = (await req('POST', `/api/awards/awards/${second}/link`, { accountId: sybil.accountId })).body
    expect(refused).toMatchObject({ code: 'awards.award.already-held', detail: { awardId: past } })
    const earlier = await issue(type, { recipientName: 'Sybil T.', awardedOn: '1985-01-01', awardedFor: 'Saint Joan' })
    expect((await req('POST', `/api/awards/awards/${earlier}/link`, { accountId: sybil.accountId, merge: true })).body).toMatchObject({ awardId: past, merged: earlier })
    expect(await rows('SELECT id, state, awarded_on AS awardedOn, awarded_for AS awardedFor FROM awards_awards WHERE id IN (?, ?) ORDER BY state DESC', earlier, past)).toEqual([
      { id: earlier, state: 'revoked', awardedOn: '1985-01-01', awardedFor: 'Saint Joan' },
      { id: past, state: 'current', awardedOn: '1985-01-01', awardedFor: 'Saint Joan' },
    ])
    const byAddress = await req('POST', `/api/awards/awards/${second}/link`, { address: 'thorndike@example.org' })
    expect(byAddress.body.accountId, JSON.stringify(byAddress.body)).toBeTruthy()
  })

  it('refuses somebody linking an award to themselves', async () => {
    const type = await awardType()
    const past = await issue(type, { recipientName: 'Me' })
    const me = await holder('Me')
    const self = person(['awards.award.update'], { accountId: me.accountId, reassertedAt: NOV_17 })
    expect((await req('POST', `/api/awards/awards/${past}/link`, { accountId: me.accountId }, self)).body.code).toBe('awards.award.own')
  })
})
