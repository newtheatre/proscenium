// Retires one of the theatre's product presets. Products made from it are unchanged.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { retirePreset } from '../../../presets'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: z.object({}).strict() }, async (event, { unit }) => {
  await retirePreset(unit, getRouterParam(event, 'id', { decode: true }) ?? '')
  return { ok: true }
})
