// Makes the four starting inspection kinds, only while there are none (spec part 6).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { startKinds } from '../../../kinds'

export default defineRoute({
  ability: 'inventory.setup.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (_event, { unit }) => ({ made: startKinds(unit.view()) }))
