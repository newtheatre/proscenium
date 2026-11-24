// Applies a rota template to many performances at once, from the Rota page (FH-06). Performances in
// a space the theatre does not manage are skipped and listed.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { applyTemplate } from '../../../../templates'
import { performanceIds } from '../../../../inputs'

export default defineRoute({
  ability: 'front-of-house.shift.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ performanceIds }).strict(),
}, (event, { input, unit }) => applyTemplate(unit.view(), getRouterParam(event, 'id', { decode: true })!, input.performanceIds, { bulk: true }))
