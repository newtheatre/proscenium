// The ticket presets, with the theatre's usual one and the spaces a preset can be usual in.
import { defineRoute } from '#kit'
import { listSpaces, placeName } from '#modules/core'
import { listTicketPresets, theatrePreset } from '../../../ticket-presets'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  rateLimit: 'default',
}, async () => {
  const spaces = await listSpaces({ performable: true })
  return {
    rows: await listTicketPresets(),
    usual: await theatrePreset(),
    spaces: await Promise.all(spaces.map(async s => ({ id: s.id, name: await placeName(s.id) ?? s.name }))),
  }
})
