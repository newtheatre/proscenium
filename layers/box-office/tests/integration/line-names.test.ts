// A ticket's kind goes unnamed where Choose tickets leaves it out: one part of the house with one kind
// the public can book. The basket, the booking pages and the messages then say "2 tickets", so a free
// show's booking does not read "2 × Full price".
import { beforeAll, describe, expect, it } from 'vitest'
import { setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { inContext } from '../../../../tests/integration/helpers'
import { unnamedKinds } from '../../server/line-names'
import { house, NOV_16, ready, req } from './stage'

beforeAll(async () => {
  setClock(NOV_16)
  resetRateLimits()
  await ready()
})

describe('naming the kind of ticket', () => {
  it('names each kind where the public can book more than one', async () => {
    const h = await house(10)
    expect([...await inContext(() => unnamedKinds(h.performanceId))]).toEqual([])
  })

  it('leaves the only kind unnamed, and names it again once a second is priced', async () => {
    const h = await house(10, { open: false })
    const priced = await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.fullId, amountMinor: 0 }] })
    expect(priced.status, JSON.stringify(priced.body)).toBe(200)
    expect([...await inContext(() => unnamedKinds(h.performanceId))]).toEqual([`${h.bandId} ${h.fullId}`])
    await req('POST', `/api/box-office/productions/${h.productionId}/prices`, { prices: [{ bandId: h.bandId, ticketTypeId: h.concessionId, amountMinor: 0 }] })
    expect([...await inContext(() => unnamedKinds(h.performanceId))]).toEqual([])
  })
})
