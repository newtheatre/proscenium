// Changes a stock location, or retires one that holds nothing and no outlet sells from.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { locationPatch, updateLocation } from '../../../../stock'

export default defineRoute({
  ability: 'bar.stock.manage',
  record: event => ['bar.stock-location', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: locationPatch,
}, async (_event, { input, record, unit }) => {
  await updateLocation(unit, record!.id, input)
  return { ok: true }
})
