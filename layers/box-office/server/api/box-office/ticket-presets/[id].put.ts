// Changes a ticket preset. Shows that started from it keep the tickets they have.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { presetInput, updateTicketPreset } from '../../../ticket-presets'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['box-office.ticket-preset', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: presetInput,
}, async (_event, { input, unit, record }) => {
  await updateTicketPreset(unit.view(), record!.id!, input)
  return { ok: true }
})
