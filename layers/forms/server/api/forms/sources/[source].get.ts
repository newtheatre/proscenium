// Searching a source for a "record from a source" question, and reading the labels of records
// already chosen (to show a kept answer again). Open to anybody answering a form, signed in or
// not: each source decides what this person may see, and one it does not open to them answers
// nothing and says so.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { sourceOf } from '../../../sources'
import { getFormBySlug, getVersion } from '../../../forms'
import type { Definition } from '../../../../shared/engine'
import { questionsOf } from '../../../../shared/engine'

const OPEN_LETTERS = 3 // not-policy: enough of a name that a search is for somebody in mind
const OPEN_RESULTS = 8 // not-policy: a short list, not a directory

const input = z.object({
  q: z.string().trim().max(100).optional(), // not-policy: shape bound
  ids: z.string().max(2000).optional(), // not-policy: shape bound
  // The form and question being answered, for a question its author opened to anybody signed in.
  form: z.string().max(120).optional(), // not-policy: shape bound
  question: z.string().max(64).optional(), // not-policy: shape bound
})

export default defineRoute({ public: true, rateLimit: 'default', input }, async (event, { input, actor }) => {
  const source = await sourceOf(getRouterParam(event, 'source', { decode: true }))
  if (!source) return refuse('forms.source.not-found', 'There is nothing to choose from here.', { status: 404 }) // not-policy: HTTP status
  if (!await source.allowed(actor)) {
    // The author of a published form may open one of its questions to anybody signed in: they find
    // a person by typing most of a name, and are shown names and nothing else.
    const form = actor.accountId && input.form && input.question ? await getFormBySlug(input.form) : null
    const live = form ? await getVersion(form.liveVersionId) : null
    const asked = live ? questionsOf(JSON.parse(live.definition) as Definition).find(q => q.question.id === input.question)?.question : undefined
    if (!asked || asked.type !== 'record' || asked.source !== source.key || !asked.openSearch) return { allowed: false, results: [], labels: {} }
    const ids = input.ids ? input.ids.split(',').filter(Boolean).slice(0, 50) : [] // not-policy: more than one answer holds
    return {
      allowed: true,
      letters: OPEN_LETTERS,
      results: input.q && input.q.length >= OPEN_LETTERS ? (await source.search(input.q, actor)).slice(0, OPEN_RESULTS).map(r => ({ id: r.id, label: r.label })) : [],
      labels: ids.length ? await source.labels(ids) : {},
    }
  }
  const ids = input.ids ? input.ids.split(',').filter(Boolean).slice(0, 50) : [] // not-policy: more than one answer holds
  return {
    allowed: true,
    results: input.q && input.q.length >= 2 ? await source.search(input.q, actor) : [],
    labels: ids.length ? await source.labels(ids) : {},
  }
})
