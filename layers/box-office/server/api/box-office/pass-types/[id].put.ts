// Changes a pass. Passes people already hold keep the price and allowance they were sold with.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { passTypeInput, updatePassType } from '../../../passes'

export default defineRoute({
  ability: 'box-office.pass.manage',
  record: event => ['box-office.pass-type', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: passTypeInput,
}, async (_event, { input, unit, record }) => {
  await updatePassType(unit.view(), record!.id!, input)
  return { ok: true }
})
