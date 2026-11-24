// A production's bands.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { listBands } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
}, async (_event, { record }) => ({ bands: await listBands(record!.id) }))
