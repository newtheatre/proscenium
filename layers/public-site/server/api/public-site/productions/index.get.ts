// What's on (C-38): published, listed productions with a scheduled performance still to come,
// narrowed by category, season, venue or month, and at most `limit` of them. A filter that is not
// well formed is ignored rather than refused, as a hand-typed address should still show something.
import { getQuery } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { currentProductions } from '#modules/core'

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120) // not-policy: a slug's bound
const filters = {
  category: slug,
  season: slug,
  venue: slug,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), // not-policy: the shape of YYYY-MM
  limit: z.coerce.number().int().min(1).max(100), // not-policy: a bound on one answer
}

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const query = getQuery(event) as Record<string, unknown>
  const options: Record<string, unknown> = {}
  for (const [key, schema] of Object.entries(filters)) {
    const parsed = schema.safeParse(Array.isArray(query[key]) ? query[key][0] : query[key])
    if (parsed.success) options[key] = parsed.data
  }
  return { productions: await currentProductions(options) }
})
