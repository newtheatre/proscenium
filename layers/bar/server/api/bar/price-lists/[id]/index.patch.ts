// Changes a price list, or retires one no outlet sells from. Standard is always in use.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { updatePriceList } from '../../../../catalogue'
import { priceListPatch } from '../../../../input'

export default defineRoute({
  ability: 'bar.price.manage',
  record: event => ['bar.price-list', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: priceListPatch,
}, async (_event, { input, record, unit }) => {
  await updatePriceList(unit, record!.id, input)
  return { ok: true }
})
