// Awards, first slice: the theatre sets up its kinds of award, staff record one the committee has
// decided, for an account, a new address or a name alone, and may correct or revoke it; the holder
// sees theirs and chooses where each is listed; erasing a person takes theirs off the roll.
import { beforeAll, describe, expect, it } from 'vitest'
import { inContext, person, rows } from '../../../../tests/integration/helpers'
import { eraseAccount } from '../../../core/server/identity/erasure'
import { awardType, holder, holds, issue, NOV_17, ready, req } from './stage'

beforeAll(ready)

describe('award types', () => {
  it('needs the ability to see or change them', async () => {
    const nobody = person([])
    expect((await req('GET', '/api/awards/types', undefined, nobody)).status).toBe(403)
    expect((await req('POST', '/api/awards/types', { key: 'x', name: 'X' }, nobody)).status).toBe(403)
  })

  it('creates one that can be given at once, and refuses a short code already in use', async () => {
    const id = await awardType({ key: 'fellowship', name: 'Fellowship', givesTicketBenefit: true })
    const { body } = await req('GET', `/api/awards/types/${id}`)
    expect(body.type).toMatchObject({ key: 'fellowship', name: 'Fellowship', givesTicketBenefit: true, onePerPerson: true, defaultVisibility: 'public', state: 'active' })
    expect(body).toMatchObject({ holders: 0, deletable: true })
    expect((await req('POST', '/api/awards/types', { key: 'fellowship', name: 'Again' })).body.code).toBe('awards.type.key-taken')
  })

  it('deletes only one never issued, and an archived one cannot be given', async () => {
    const unused = await awardType()
    expect((await req('DELETE', `/api/awards/types/${unused}`, {})).status).toBe(200)
    const used = await awardType()
    await issue(used, { recipientName: 'Sybil Thorndike' })
    expect((await req('DELETE', `/api/awards/types/${used}`, {})).status).toBe(409)
    expect((await req('PATCH', `/api/awards/types/${used}`, { state: 'archived' })).status).toBe(200)
    expect((await req('POST', `/api/awards/types/${used}/awards`, { awardedOn: '2026-11-17', recipientName: 'Ellen Terry' })).body.code).toBe('awards.type.archived')
  })
})

describe('issuing an award', () => {
  it('records one for an account with the account\'s name, tells them, and the fact follows', async () => {
    const type = await awardType({ defaultVisibility: 'members' })
    const ada = await holder('Ada Lovelace')
    expect(await holds(ada.accountId!, type)).toBe(false)
    const id = await issue(type, { accountId: ada.accountId, awardedFor: 'Twenty years of set building', decidedOn: '2026-11-10', decisionNote: 'Committee, 9 for, 0 against' })
    const { body } = await req('GET', `/api/awards/awards/${id}`)
    expect(body.award).toMatchObject({ recipientName: 'Ada Lovelace', accountId: ada.accountId, awardedOn: '2026-11-17', visibility: 'members', state: 'current', source: 'direct', decisionNote: 'Committee, 9 for, 0 against' })
    expect(await holds(ada.accountId!, type)).toBe(true)
    expect((await req('GET', `/api/awards/types/${type}`)).body.holders).toBe(1)
    expect(await rows('SELECT name FROM core_events WHERE record_id = ?', id)).toEqual([{ name: 'awards.award.issued' }])
    expect((await req('GET', '/api/awards/mine', undefined, ada)).body.awards).toMatchObject([{ id, awardedFor: 'Twenty years of set building' }])
    expect((await req('GET', `/api/awards/accounts/${ada.accountId}/awards`)).body.awards).toHaveLength(1)
  })

  it('gives a one-per-person award only once, and a repeatable one again', async () => {
    const once = await awardType()
    const many = await awardType({ onePerPerson: false })
    const grace = await holder('Grace Hopper')
    await issue(once, { accountId: grace.accountId })
    expect((await req('POST', `/api/awards/types/${once}/awards`, { awardedOn: '2026-11-17', accountId: grace.accountId })).body.code).toBe('awards.award.already-held')
    await issue(many, { accountId: grace.accountId })
    await issue(many, { accountId: grace.accountId })
    expect((await req('GET', '/api/awards/mine', undefined, grace)).body.awards).toHaveLength(3)
  })

  it('makes an account for a new address, and lists a name alone with no account', async () => {
    const type = await awardType()
    const made = await req('POST', `/api/awards/types/${type}/awards`, { awardedOn: '2026-11-17', recipientName: 'Alan Turing', address: 'alan@example.org' })
    expect(made.body.accountId, JSON.stringify(made.body)).toBeTruthy()
    const past = await issue(type, { recipientName: 'Peggy Ashcroft', awardedOn: '1998-06-01' })
    const listed = (await req('GET', `/api/awards/awards?type=${type}`)).body.awards
    expect(listed.map((a: any) => [a.recipientName, a.linked])).toEqual([['Alan Turing', true], ['Peggy Ashcroft', false]])
    expect((await req('GET', `/api/awards/awards/${past}`)).body.award.accountId).toBeNull()
    // Somebody who has never signed in is not put on the public roll for them; a name alone (a past award) is.
    expect((await req('GET', `/api/awards/awards/${made.body.awardId}`)).body.award.visibility).toBe('hidden')
    expect((await req('GET', `/api/awards/awards/${past}`)).body.award.visibility).toBe('public')
  })

  it('refuses a person\'s own award, and needs a person or a name', async () => {
    const type = await awardType()
    const me = await holder('The Secretary')
    const self = person(['awards.award.issue'], { accountId: me.accountId, reassertedAt: NOV_17 })
    expect((await req('POST', `/api/awards/types/${type}/awards`, { awardedOn: '2026-11-17', accountId: me.accountId }, self)).body.code).toBe('awards.award.own')
    expect((await req('POST', `/api/awards/types/${type}/awards`, { awardedOn: '2026-11-17' })).status).toBe(422)
  })
})

describe('correcting and revoking', () => {
  it('corrects the wording, and revokes once with a reason, which ends the fact', async () => {
    const type = await awardType()
    const ada = await holder('Ada Byron')
    const id = await issue(type, { accountId: ada.accountId })
    expect((await req('PATCH', `/api/awards/awards/${id}`, { citation: 'For the engine.', visibility: 'hidden' })).status).toBe(200)
    expect((await req('GET', `/api/awards/awards/${id}`)).body.award).toMatchObject({ citation: 'For the engine.', visibility: 'hidden' })
    expect((await req('POST', `/api/awards/awards/${id}/revoke`, { reason: '' })).status).toBe(422)
    expect((await req('POST', `/api/awards/awards/${id}/revoke`, { reason: 'Issued in error' })).status).toBe(200)
    expect((await req('POST', `/api/awards/awards/${id}/revoke`, { reason: 'Again' })).body.code).toBe('awards.award.already-revoked')
    expect((await req('GET', `/api/awards/awards/${id}`)).body.award).toMatchObject({ state: 'revoked', revokeReason: 'Issued in error' })
    expect(await holds(ada.accountId!, type)).toBe(false)
    expect((await req('GET', '/api/awards/mine', undefined, ada)).body.awards).toEqual([])
    await issue(type, { accountId: ada.accountId })
    expect(await holds(ada.accountId!, type)).toBe(true)
  })

  it('refuses somebody correcting or revoking their own', async () => {
    const type = await awardType()
    const me = await holder('A Fellow')
    const id = await issue(type, { accountId: me.accountId })
    const self = person(['awards.award.update', 'awards.award.revoke'], { accountId: me.accountId, reassertedAt: NOV_17 })
    expect((await req('PATCH', `/api/awards/awards/${id}`, { citation: 'Me' }, self)).status).toBe(403)
    expect((await req('POST', `/api/awards/awards/${id}/revoke`, { reason: 'x' }, self)).status).toBe(403)
  })
})

describe('the holder', () => {
  it('chooses where their own award is listed, and nobody else\'s', async () => {
    const type = await awardType()
    const ada = await holder('Ada King')
    const other = await holder('Somebody Else')
    const id = await issue(type, { accountId: ada.accountId })
    expect((await req('POST', `/api/awards/mine/${id}/visibility`, { visibility: 'hidden' }, other)).body.code).toBe('core.not-found')
    expect((await req('POST', `/api/awards/mine/${id}/visibility`, { visibility: 'members' }, ada)).body).toMatchObject({ visibility: 'members' })
    expect((await req('GET', '/api/awards/mine', undefined, ada)).body.awards[0].visibility).toBe('members')
  })

  it('leaves the roll when they are erased', async () => {
    const type = await awardType()
    const ada = await holder('Ada Gone')
    const id = await issue(type, { accountId: ada.accountId, citation: 'For everything.' })
    await inContext(async () => {
      await eraseAccount(ada.accountId!)
    })
    const [row] = await rows<{ visibility: string, recipient_name: string, citation: string | null }>('SELECT visibility, recipient_name, citation FROM awards_awards WHERE id = ?', id)
    expect(row!.visibility).toBe('hidden')
    expect(row!.recipient_name).not.toBe('Ada Gone')
    expect(row!.citation).not.toBe('For everything.')
  })
})
