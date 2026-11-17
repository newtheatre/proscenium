// Adds a ticket preset, from the presets screen or saved from a show's Tickets tab.
import { defineRoute } from '#kit'
import { createTicketPreset, presetInput } from '../../../ticket-presets'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  rateLimit: 'write',
  idempotent: true,
  input: presetInput,
}, async (_event, { input, unit, actor }) => ({ id: await createTicketPreset(unit.view(), input, actor.accountId ?? null) }))
