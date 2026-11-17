// Changes a ticket preset. Shows that started from it keep the tickets they have.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { presetInput, updateTicketPreset } from '../../../ticket-presets'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['box-office.ticket-preset', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: presetInput,
}, async (_event, { input, unit, record }) => {
  await updateTicketPreset(unit.view(), record!.id!, input)
  return { ok: true }
})
