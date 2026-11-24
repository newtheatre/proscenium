// Deletes a ticket preset. Its spaces fall back to the theatre's usual one.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { deleteTicketPreset } from '../../../ticket-presets'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['box-office.ticket-preset', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, async (_event, { unit, record }) => {
  deleteTicketPreset(unit.view(), record!.id!)
  return { ok: true }
})
