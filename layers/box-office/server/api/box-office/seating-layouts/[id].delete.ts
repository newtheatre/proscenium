// Deletes a seating layout no performance still to come uses.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { deleteLayout } from '../../../layouts'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['box-office.seating-layout', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { unit, record }) => {
  await deleteLayout(unit.view(), record!.id!)
  return { ok: true }
})
