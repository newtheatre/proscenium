// Adds a duty: a kind of job on a night (FH-05).
import { defineRoute } from '#kit'
import { createDuty } from '../../../shifts'
import { dutyInput } from '../../../inputs'

export default defineRoute({
  ability: 'front-of-house.duty.manage',
  rateLimit: 'write',
  idempotent: true,
  input: dutyInput,
}, (_event, { input, unit }) => ({ dutyId: createDuty(unit.view(), input) }))
