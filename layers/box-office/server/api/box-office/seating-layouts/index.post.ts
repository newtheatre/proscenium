// Adds a seating layout to a space. A space's first layout is its usual one.
import { defineRoute } from '#kit'
import { createLayout, layoutInput } from '../../../layouts'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  rateLimit: 'write',
  idempotent: true,
  input: layoutInput,
}, async (_event, { input, unit }) => ({ id: await createLayout(unit.view(), input) }))
