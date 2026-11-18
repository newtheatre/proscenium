// AC-3 and AC-7: a person's coming shifts reach My account's Upcoming card through core.upcoming,
// and the members' home card counts their coming shifts and the open ones.
import { beforeAll, describe, expect, it } from 'vitest'
import { usePoint } from '#kit'
import { upcomingFor } from '../../../core/server/interface/upcoming'
import type { Count } from '../../../core/server/points/count'
import type { UpcomingSource } from '../../../core/server/points/upcoming'
import tickets from '../../../box-office/server/contributions/core.upcoming/tickets'
import { inContext } from '../../../../tests/integration/helpers'
import { duty, performance, ready, req, shift, volunteer } from './stage'

beforeAll(ready)

const homeCount = (actor: ReturnType<typeof volunteer>) => inContext(async () => {
  const [found] = (await usePoint<Count>('core.count')).filter(c => c.id === 'front-of-house.members-home')
  return found!.value.value(actor)
}, actor)

describe('coming shifts on My account and the members\' home (AC-3, AC-7)', () => {
  it('lists the person\'s coming shift, soonest first, opening the shift', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Usher'))
    const ann = volunteer()
    expect(await inContext(() => upcomingFor(ann), ann)).toEqual([])
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, ann)
    const items = await inContext(() => upcomingFor(ann), ann)
    expect(items).toEqual([expect.objectContaining({ key: `front-of-house.shifts:${id}`, label: 'front-of-house.upcoming.shift', params: { duty: expect.stringContaining('Usher') }, to: `/members/front-of-house/shifts/${id}` })])
  })

  it('counts coming shifts and open ones for the members\' home card', async () => {
    const p = await performance()
    const id = await shift(p.id, await duty('Steward'))
    const bo = volunteer()
    const before = await homeCount(bo)
    expect(before).toBeGreaterThan(0) // the open shift just published
    await req('POST', `/api/front-of-house/shifts/${id}/sign-up`, {}, bo)
    // The shift moves from open to coming: still counted once.
    expect(await homeCount(bo)).toBe(before)
  })
})

describe('tickets on My account (AC-3)', () => {
  it('asks box office for the person\'s coming performances without failing', async () => {
    const ann = volunteer()
    const source: UpcomingSource = tickets
    expect(await inContext(() => source.items(ann, 5), ann)).toEqual([])
  })
})
