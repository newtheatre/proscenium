// Erases the description of a person refused on one row. Cannot be undone; the audit entry keeps no words.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { eraseDescription } from '../../../../age-checks'

export default defineRoute({ ability: 'bar.age-check.review', rateLimit: 'write', input: z.object({}).strict() }, async (event, { unit }) => {
  eraseDescription(unit, getRouterParam(event, 'id', { decode: true })!)
  return { ok: true }
})
