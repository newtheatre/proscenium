// Searching a source for a "record from a source" question, and reading the labels of records
// already chosen (to show a kept answer again). Open to anybody answering a form, signed in or
// not: each source decides what this person may see, and one it does not open to them answers
// nothing and says so.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { sourceOf } from '../../../sources'

const input = z.object({
  q: z.string().trim().max(100).optional(), // not-policy: shape bound
  ids: z.string().max(2000).optional(), // not-policy: shape bound
})

export default defineRoute({ public: true, rateLimit: 'default', input }, async (event, { input, actor }) => {
  const source = await sourceOf(getRouterParam(event, 'source'))
  if (!source) return refuse('forms.source.not-found', 'There is nothing to choose from here.', { status: 404 }) // not-policy: HTTP status
  if (!await source.allowed(actor)) return { allowed: false, results: [], labels: {} }
  const ids = input.ids ? input.ids.split(',').filter(Boolean).slice(0, 50) : [] // not-policy: more than one answer holds
  return {
    allowed: true,
    results: input.q && input.q.length >= 2 ? await source.search(input.q, actor) : [],
    labels: ids.length ? await source.labels(ids) : {},
  }
})
