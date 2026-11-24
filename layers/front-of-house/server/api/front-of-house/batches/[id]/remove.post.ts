// Removes a batch (FH-48): shifts nobody has a place on are cancelled; the rest are listed back.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { removeBatch } from '../../../../grid'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (event, { unit }) => removeBatch(unit.view(), getRouterParam(event, 'id')!))
