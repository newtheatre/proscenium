// Pins sizes to the front of an outlet's till, in order, replacing what was pinned.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { setFavourites } from '../../../../catalogue'
import { favouritesInput } from '../../../../input'

export default defineRoute({
  ability: 'bar.outlet.manage',
  record: event => ['bar.outlet', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: favouritesInput,
}, async (_event, { input, record, unit }) => {
  setFavourites(unit, record!.id, input.variantIds)
  return { ok: true }
})
