// core.requirement: verdicts from sources, unavailable as the host chooses, quantity on a met
// answer, checkAbility for somebody else's account, and the presented-value rate limit.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newId, requirements, runInContext } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { calls, members } from '../fixtures/modules/seats/server/contributions/core.requirement/seats'
import { env, inContext, person, rows, setModule } from './helpers'
import type { Actor } from '#kit'

const as = <T>(actor: Actor, fn: () => Promise<T>, address = '192.0.2.1') => runInContext({ env, actor, cache: {}, address }, fn)
// Staff who may look members up, so the source answers about any account.
const staff = () => person(['seats.members.look-up'])

beforeEach(() => {
  members.clear()
  calls.length = 0
  resetRateLimits()
})
afterEach(() => setModule('seats', true))

describe('requirements', () => {
  it('answers each pair, with a quantity only on a met verdict', async () => {
    const member = newId('acc')
    const other = newId('acc')
    members.add(member)
    const answers = await as(staff(), () => requirements.check({ accounts: [member, other], refs: ['seats:member'], whenUnavailable: 'met' }))
    expect(answers).toEqual([
      { account: member, ref: 'seats:member', verdict: 'met', unavailable: false, quantity: 2, summary: 'Member: current' },
      { account: other, ref: 'seats:member', verdict: 'not-met', unavailable: false, reason: 'We could not find that membership.' },
    ])
  })

  it('gives the host\'s choice when the source is switched off, and says so', async () => {
    await setModule('seats', false)
    const account = newId('acc')
    const restrict = await inContext(() => requirements.check({ accounts: [account], refs: ['seats:member'], whenUnavailable: 'met' }))
    const benefit = await inContext(() => requirements.check({ accounts: [account], refs: ['seats:member'], whenUnavailable: 'not-met' }))
    expect(restrict).toEqual([{ account, ref: 'seats:member', verdict: 'met', unavailable: true }])
    expect(benefit).toEqual([{ account, ref: 'seats:member', verdict: 'not-met', unavailable: true }])
  })

  it('treats a source that fails as unavailable, and an unknown reference as not met', async () => {
    const account = newId('acc')
    const answers = await as(staff(), () => requirements.check({ accounts: [account], refs: ['seats:broken', 'nobody:thing'], whenUnavailable: 'not-met' }))
    expect(answers).toMatchObject([
      { ref: 'seats:broken', verdict: 'not-met', unavailable: true },
      { ref: 'nobody:thing', verdict: 'not-met', unavailable: true },
    ])
  })

  it('answers a fact itself', async () => {
    const regular = newId('acc')
    members.add(regular)
    const answers = await inContext(() => requirements.check({ accounts: [regular, newId('acc')], refs: ['fact:seats.regular', 'fact:seats.nobody'], whenUnavailable: 'met' }))
    expect(answers.map(a => [a.ref, a.verdict])).toEqual([['fact:seats.regular', 'met'], ['fact:seats.nobody', 'not-met'], ['fact:seats.regular', 'not-met'], ['fact:seats.nobody', 'not-met']])
  })

  describe('asking about somebody else', () => {
    it('answers about the actor\'s own account as usual', async () => {
      const me = person([])
      members.add(me.accountId!)
      const [answer] = await as(me, () => requirements.check({ accounts: [me.accountId!], refs: ['seats:member'], whenUnavailable: 'met' }))
      expect(answer).toMatchObject({ verdict: 'met' })
    })

    it('does not call the source without the ability, and records the read when held', async () => {
      const other = newId('acc')
      members.add(other)
      const [refused] = await as(person([]), () => requirements.check({ accounts: [other], refs: ['seats:member'], whenUnavailable: 'met' }))
      expect(refused).toMatchObject({ verdict: 'not-met', unavailable: false, reason: expect.any(String) })
      expect(calls).toHaveLength(0)

      const [allowed] = await as(person(['seats.members.look-up']), () => requirements.check({ accounts: [other], refs: ['seats:member'], whenUnavailable: 'met' }))
      expect(allowed).toMatchObject({ verdict: 'met' })
      expect(await rows("SELECT ability, record_type, record_id FROM core_audit WHERE record_id = ? AND action = 'read'", other)).toEqual([{ ability: 'seats.members.look-up', record_type: 'core.account', record_id: other }])
    })

    it('treats a job as not holding the ability', async () => {
      const other = newId('acc')
      members.add(other)
      const [answer] = await inContext(() => requirements.check({ accounts: [other], refs: ['seats:member'], whenUnavailable: 'met' }), { kind: 'job' })
      expect(answer).toMatchObject({ verdict: 'not-met' })
      expect(calls).toHaveLength(0)
    })
  })

  describe('a value the person presents', () => {
    const anonymous: Actor = { kind: 'anonymous' }
    it('meets with a typed number and later with the evidence it returned', async () => {
      const [typed] = await as(anonymous, () => requirements.check({ accounts: [null], refs: ['seats:member'], presented: [{ ref: 'seats:member', value: '12345678' }], whenUnavailable: 'not-met' }))
      expect(typed).toMatchObject({ account: null, verdict: 'met', evidence: 'ev_member' })
      const [again] = await as(anonymous, () => requirements.check({ accounts: [null], refs: ['seats:member'], presented: [{ ref: 'seats:member', evidence: typed!.evidence! }], whenUnavailable: 'not-met' }))
      expect(again).toMatchObject({ verdict: 'met' })
    })

    it('stops guessing at the presented-value limit without calling the source', async () => {
      const guess = (n: number) => as(anonymous, () => requirements.check({ accounts: [null], refs: ['seats:member'], presented: [{ ref: 'seats:member', value: String(n).padStart(8, '0') }], whenUnavailable: 'not-met' }))
      for (let n = 0; n < 10; n++) await guess(n)
      const before = calls.length
      const [stopped] = await guess(99)
      expect(stopped).toMatchObject({ verdict: 'not-met', unavailable: false, reason: expect.stringMatching(/wait/i) })
      expect(calls.length).toBe(before)
    })
  })

  it('names the holder of a piece of evidence only for staff with the ability, and records the read', async () => {
    await expect(as(person([]), () => requirements.holder('seats:member', 'ev_member'))).rejects.toMatchObject({ status: 403 })
    expect(await as(person(['seats.members.look-up']), () => requirements.holder('seats:member', 'ev_member'))).toBe('A. Member')
  })

  it('offers and describes references', async () => {
    expect(await inContext(() => requirements.options('seats', 'member'))).toEqual([{ reference: 'seats:member', label: 'A current member' }])
    expect(await inContext(() => requirements.describe(['seats:member', 'fact:seats.regular']))).toEqual({
      'seats:member': { label: 'A current member', presentable: { label: 'Membership number', shape: 'digits-8' } },
      'fact:seats.regular': { label: 'seats.facts.regular.label' },
    })
  })
})
