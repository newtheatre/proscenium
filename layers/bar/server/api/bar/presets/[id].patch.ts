// Renames one of the theatre's product presets, or brings back one that was deleted (its Undo).
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { presetPatch, updatePreset } from '../../../presets'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: presetPatch }, async (event, { input, unit }) => {
  await updatePreset(unit, getRouterParam(event, 'id', { decode: true }) ?? '', input)
  return { ok: true }
})
