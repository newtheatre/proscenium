// Deletes a run preset. Spaces that used it as their usual one fall back to the theatre's.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { deleteRunPreset } from '../../../../programme/run-presets'

export default defineRoute({
  ability: 'core.programme.configure',
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit }) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  await deleteRunPreset(unit, id)
  return { id }
})
