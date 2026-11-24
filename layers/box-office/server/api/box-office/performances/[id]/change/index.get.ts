// What a change would touch (BO-52, BO-53): the bookings and money a change to the
// performance would touch, and what has been decided for them.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { getPerformance, placeName } from '#modules/core'
import { affected } from '../../../../../change'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const performance = await getPerformance(record!.id!)
  return {
    performance: { id: performance.id, title: performance.productionTitle, startsAt: performance.startsAt, state: performance.state, venue: await placeName(performance.spaceId) ?? performance.venueName },
    ...await affected(performance.id),
  }
})
