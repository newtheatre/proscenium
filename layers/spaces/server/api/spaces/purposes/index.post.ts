// Adds a purpose.
import { defineRoute } from '#kit'
import { addPurpose } from '../../../setup'
import { purposeInput } from '../../../inputs'

export default defineRoute({
  ability: 'spaces.purpose.manage',
  rateLimit: 'write',
  idempotent: true,
  input: purposeInput,
}, async (_event, { input, unit }) => ({ purposeId: await addPurpose(unit.view(), input) }))
