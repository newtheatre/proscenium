// The shifts of a performance, with their places and window.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { shiftsOf } from '../../../../../shifts'

export default defineRoute({
  ability: 'front-of-house.shift.view',
  rateLimit: 'default',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
}, async (_event, { record }) => ({ shifts: await shiftsOf(record!.id!) }))
