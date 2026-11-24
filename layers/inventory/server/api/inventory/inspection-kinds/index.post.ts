// Adds an inspection kind (INV-08).
import { defineRoute } from '#kit'
import { addKind } from '../../../kinds'
import { kindInput } from '../../../inputs'

export default defineRoute({
  ability: 'inventory.setup.manage',
  rateLimit: 'write',
  idempotent: true,
  input: kindInput,
}, (_event, { input, unit }) => ({ kindId: addKind(unit.view(), input) }))
