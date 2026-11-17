// An impliable ability comes with whatever implies it, at any reach, with no record: a grant on one
// performance to sell brings finding orders anywhere, and nothing else.
import { describe, expect, it } from 'vitest'
import { can } from '#kit/access'
import { newId } from '#kit/ids'
import { inContext, person } from './helpers'

describe('an impliable ability', () => {
  const performance = { type: 'seats.performance', id: newId('prf') }
  const onePerformance = person([], { grants: [{ ability: 'seats.orders.sell', record: performance, via: 'grant:one-performance' }] })

  it('comes with a record-scoped grant of an ability that implies it, recorded as that grant', async () => {
    expect(await inContext(() => can(onePerformance, 'seats.orders.find' as never), onePerformance)).toEqual({ allowed: true, by: 'grant:one-performance' })
  })
  it('comes with a module-wide grant', async () => {
    const seats = person([], { grants: [{ module: 'seats', via: 'grant:seats' }] })
    expect(await inContext(() => can(seats, 'seats.orders.find' as never), seats)).toMatchObject({ allowed: true, by: 'grant:seats' })
  })
  it('brings nothing else: the implying ability stays on its record', async () => {
    const decision = await inContext(() => can(onePerformance, 'seats.orders.sell' as never, ['seats.performance', newId('prf')]), onePerformance)
    expect(decision.allowed).toBe(false)
  })
  it('is refused to someone holding nothing that implies it', async () => {
    const other = person(['seats.members.look-up'])
    expect((await inContext(() => can(other, 'seats.orders.find' as never), other)).allowed).toBe(false)
  })
})
