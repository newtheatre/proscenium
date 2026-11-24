// Changes a seating layout. Performances still to come that use it take its new numbers.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { layoutInput, updateLayout } from '../../../layouts'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['box-office.seating-layout', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: layoutInput,
}, async (_event, { input, unit, record }) => {
  await updateLayout(unit.view(), record!.id!, input)
  return { ok: true }
})
