// Who may decide requests in a room and manage its bookings, and how many may book it (SP-13).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { peopleOf } from '../../../../decisions'

export default defineRoute({
  ability: 'spaces.bookable.manage',
  record: event => ['spaces.bookable', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async event => await peopleOf(getRouterParam(event, 'id')!))
