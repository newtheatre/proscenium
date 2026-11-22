// The membership gate's first part (MEM-01, 02, 06, 07, 08, 11, 24, 56): a scheme is set up as a
// draft with its lengths, opens only when ready, and a free scheme is joined in one request; staff
// add a member by address; the standing follows the dates with nothing run, on the right side only.
import { beforeAll, describe, expect, it } from 'vitest'
import { setClock } from '#kit'
import { person, rows } from '../../../../tests/integration/helpers'
import { holds, NOV_17, officer, ready, req, scheme } from './stage'

beforeAll(ready)

describe('setting up a scheme', () => {
  it('needs the ability to see or change schemes', async () => {
    const nobody = person([])
    expect((await req('POST', '/api/membership/schemes', { key: 'x', name: 'X', side: 'members', lengthRule: 'rolling' }, nobody)).status).toBe(403)
    expect((await req('GET', '/api/membership/schemes/all', undefined, nobody)).status).toBe(403)
  })

  it('saves a draft with settings for its defaults, and shows the dates a membership taken today would run to', async () => {
    const id = await scheme({}, [12, 36])
    const { body } = await req('GET', `/api/membership/schemes/${id}`)
    expect(body.scheme).toMatchObject({ state: 'draft', side: 'members', renewalOpensDays: 30, graceDays: 0, holderMayEnd: true })
    expect(body.example.map((e: any) => e.endsOn)).toEqual(['2027-11-16', '2029-11-16'])
    expect(body.checklist).toEqual([{ code: 'length-option', done: true }, { code: 'members-area', done: true }])
  })

  it('creates a draft from its name alone: a members\' scheme from the day it starts, with a free address', async () => {
    const name = `Name Only ${Date.now()}`
    const first = await req('POST', '/api/membership/schemes', { name })
    expect(first.status).toBe(200)
    const { scheme: made } = (await req('GET', `/api/membership/schemes/${first.body.schemeId}`)).body
    expect(made).toMatchObject({ state: 'draft', side: 'members', lengthRule: 'rolling', joinMode: 'apply', key: name.toLowerCase().replace(/ /g, '-') })
    // A second scheme of the same name is not refused for its address: it takes the next free one.
    const second = await req('POST', '/api/membership/schemes', { name })
    expect((await req('GET', `/api/membership/schemes/${second.body.schemeId}`)).body.scheme.key).toBe(`${made.key}-2`)
  })

  it('refuses a fixed scheme with no end date, or one ending on 29 February', async () => {
    expect((await req('POST', '/api/membership/schemes', { key: 'fixed-a', name: 'Fixed', side: 'members', lengthRule: 'fixed' })).body.code).toBe('membership.scheme.fixed-end')
    expect((await req('POST', '/api/membership/schemes', { key: 'fixed-b', name: 'Fixed', side: 'members', lengthRule: 'fixed', fixedEndMonth: 2, fixedEndDay: 29 })).body.code).toBe('membership.scheme.fixed-end-day')
  })

  it('refuses to ask for a fee while Membership fees is off, and says it is off', async () => {
    expect((await req('POST', '/api/membership/schemes', { key: `fee-${Date.now()}`, name: 'Fee', side: 'members', lengthRule: 'rolling', requiresPayment: true })).body.code).toBe('membership.scheme.fees-off')
    const id = await scheme()
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { requiresPayment: true })).body.code).toBe('membership.scheme.fees-off')
    expect((await req('GET', `/api/membership/schemes/${id}`)).body).toMatchObject({ feesModuleOn: false, feesOn: false })
  })

  it('refuses to open without a length, or while it asks for a check that does not exist yet (S4)', async () => {
    const bare = await scheme({}, [])
    expect((await req('POST', `/api/membership/schemes/${bare}/state`, { to: 'open' })).body.code).toBe('membership.scheme.needs-length-option')
    const approved = await scheme({ needsApproval: true })
    expect((await req('POST', `/api/membership/schemes/${approved}/state`, { to: 'open' })).body.code).toBe('membership.scheme.needs-application-form')
  })

  it('moves through open, closed and archived, announcing opening and closing, and deletes only a draft', async () => {
    const id = await scheme()
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'archived' })).status).toBe(409)
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).body).toMatchObject({ state: 'open', holders: 0 })
    expect((await req('DELETE', `/api/membership/schemes/${id}`)).body.code).toBe('membership.scheme.not-deletable')
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { key: 'renamed' })).body.code).toBe('membership.scheme.key-fixed')
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'closed' })).body.state).toBe('closed')
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'archived' })).body.state).toBe('archived')
    expect(await rows('SELECT name FROM core_events WHERE record_id = ? ORDER BY rowid', id)).toEqual([{ name: 'membership.scheme.opened' }, { name: 'membership.scheme.closed' }])
    const draft = await scheme()
    expect((await req('DELETE', `/api/membership/schemes/${draft}`)).body).toEqual({ deleted: true })
  })

  it('lists only open schemes publicly, with their offered lengths', async () => {
    const id = await scheme({}, [12, 36])
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const options = (await req('GET', `/api/membership/schemes/${id}`)).body.options
    await req('PATCH', `/api/membership/schemes/${id}/options/${options[1].id}`, { state: 'withdrawn' })
    const listed = (await req('GET', '/api/membership/schemes', undefined, null)).body.schemes.find((s: any) => s.id === id)
    expect(listed.options.map((o: any) => o.count)).toEqual([12])
  })
})

describe('holding a scheme', () => {
  it('joins a free unchecked scheme in one request, with a member number, and opens the members\' area (MEM-11, MEM-06)', async () => {
    const id = await scheme({ key: 'student', name: 'Student member' }, [12, 36])
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const student = person([])
    const options = (await req('GET', `/api/membership/schemes/${id}`)).body.options
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, student)).body.code).toBe('membership.option.choose')
    const joined = await req('POST', `/api/membership/schemes/${id}/join`, { lengthOptionId: options[1].id }, student)
    expect(joined.body).toMatchObject({ startsOn: '2026-11-17', endsOn: '2029-11-16', opensMembersArea: true })
    expect((await req('POST', `/api/membership/schemes/${id}/join`, { lengthOptionId: options[0].id }, student)).body.code).toBe('membership.join.already-held')
    expect(await holds(student.accountId!, 'membership.holder')).toBe(true)
    expect(await holds(student.accountId!, 'membership.supporter')).toBe(false)
    expect(await holds(student.accountId!, 'core.member')).toBe(true)
    const mine = (await req('GET', '/api/membership/mine', undefined, student)).body
    expect(mine.number.label).toMatch(/^M-\d+$/)
    expect(mine.memberships).toMatchObject([{ schemeName: 'Student member', length: '36 months', status: 'current' }])
    // A welcome, once, with how long it runs and the way to the card (EM-12).
    const welcomes = await rows<{ payload: string }>("SELECT payload FROM core_notifications WHERE type_key = 'membership.welcome' AND account_id = ?", student.accountId)
    expect(welcomes).toHaveLength(1)
    expect(JSON.parse(welcomes[0]!.payload)).toMatchObject({ scheme: 'Student member', until: 'It runs until 16 November 2029.' })
  })

  it('restates the lengths when the rule changes between months and scheme years, and refuses what cannot be', async () => {
    const id = await scheme({}, [12, 36])
    const fixed = await req('PATCH', `/api/membership/schemes/${id}`, { lengthRule: 'fixed', fixedEndMonth: 7, fixedEndDay: 31 })
    expect(fixed.status, JSON.stringify(fixed.body)).toBe(200)
    expect((await req('GET', `/api/membership/schemes/${id}`)).body.options.map((o: any) => o.count)).toEqual([1, 3])
    const back = await req('PATCH', `/api/membership/schemes/${id}`, { lengthRule: 'rolling', fixedEndMonth: null, fixedEndDay: null })
    expect(back.status, JSON.stringify(back.body)).toBe(200)
    expect((await req('GET', `/api/membership/schemes/${id}`)).body.options.map((o: any) => o.count)).toEqual([12, 36])

    // 6 months is not a whole number of scheme years; nothing is changed.
    const odd = await scheme({}, [6])
    const refused = await req('PATCH', `/api/membership/schemes/${odd}`, { lengthRule: 'fixed', fixedEndMonth: 7, fixedEndDay: 31 })
    expect(refused.body.code).toBe('membership.scheme.lengths-fixed')
    expect((await req('GET', `/api/membership/schemes/${odd}`)).body.scheme.lengthRule).toBe('rolling')
    // Indefinite has no unit to restate them in.
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { lengthRule: 'indefinite' })).body.code).toBe('membership.scheme.lengths-fixed')
  })

  it('gives a supporters\' scheme its benefits and never the members\' area (MEM-07)', async () => {
    const id = await scheme({ side: 'audience', lengthRule: 'indefinite' }, [])
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const friend = person([])
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, friend)).body).toMatchObject({ endsOn: null, opensMembersArea: false })
    expect(await holds(friend.accountId!, 'membership.supporter')).toBe(true)
    expect(await holds(friend.accountId!, 'membership.holder')).toBe(false)
    expect(await holds(friend.accountId!, 'core.member')).toBe(false)
    // S2: the side is fixed once anybody has held it.
    expect((await req('PATCH', `/api/membership/schemes/${id}`, { side: 'members' })).body.code).toBe('membership.scheme.side-fixed')
  })

  it('offers staff only the lengths on sale, and asks for none when both dates are given', async () => {
    const id = await scheme({ joinMode: 'staff-only' }, [12, 36])
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const options = (await req('GET', `/api/membership/schemes/${id}`)).body.options
    await req('PATCH', `/api/membership/schemes/${id}/options/${options[1].id}`, { state: 'withdrawn' })
    const address = () => `staff${Math.random().toString(36).slice(2)}@example.org`
    expect((await req('POST', `/api/membership/schemes/${id}/members`, { address: address(), lengthOptionId: options[1].id })).body.code).toBe('membership.option.unknown')
    expect((await req('POST', `/api/membership/schemes/${id}/members`, { address: address(), startsOn: '2026-09-01', endsOn: '2027-08-31' })).status).toBe(200)
  })

  it('lets staff add a member by address, with dates by hand, and never to themselves (MEM-24)', async () => {
    const id = await scheme({ joinMode: 'staff-only', graceDays: 5 })
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const added = await req('POST', `/api/membership/schemes/${id}/members`, { name: 'Ada Lovelace', address: `ada${Date.now()}@example.org`, startsOn: '2026-09-01', endsOn: '2026-12-31', note: 'Backdated' })
    expect(added.body).toMatchObject({ startsOn: '2026-09-01', endsOn: '2026-12-31', opensMembersArea: true })
    expect(await rows('SELECT origin, state, added_by FROM membership_memberships WHERE id = ?', added.body.membershipId)).toEqual([{ origin: 'added', state: 'active', added_by: officer.accountId }])
    expect((await req('POST', `/api/membership/schemes/${id}/join`, {}, person([]))).body.code).toBe('membership.join.staff-only')
    expect((await req('POST', `/api/membership/schemes/${id}/members`, { accountId: officer.accountId })).status).toBe(404)

    // MEM-08: the standing ends after grace with nothing run.
    expect(await holds(added.body.accountId, 'membership.holder')).toBe(true)
    setClock(Date.UTC(2027, 0, 5, 12))
    expect(await holds(added.body.accountId, 'membership.holder')).toBe(true)
    setClock(Date.UTC(2027, 0, 6, 12))
    expect(await holds(added.body.accountId, 'membership.holder')).toBe(false)
    setClock(NOV_17)
    expect((await req('GET', '/api/membership/schemes/all')).body.schemes.find((s: any) => s.id === id).holders).toBe(1)
  })

  it('refuses staff adding their own account', async () => {
    const id = await scheme()
    await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })
    const address = `self${Date.now()}@example.org`
    const first = await req('POST', `/api/membership/schemes/${id}/members`, { address })
    const self = { ...officer, accountId: first.body.accountId }
    expect((await req('POST', `/api/membership/schemes/${id}/members`, { address }, self)).body.code).toBe('membership.membership.own')
  })
})
