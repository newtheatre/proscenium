// Changes an inspection kind. A new interval moves future due dates only (N10).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { kindRow, updateKind } from '../../../../kinds'
import { kindInput } from '../../../../inputs'

export default defineRoute({
  ability: 'inventory.setup.manage',
  rateLimit: 'write',
  idempotent: true,
  input: kindInput,
}, async (event, { input, unit }) => {
  updateKind(unit.view(), await kindRow(getRouterParam(event, 'id')!), input)
  return { kindId: getRouterParam(event, 'id') }
})
