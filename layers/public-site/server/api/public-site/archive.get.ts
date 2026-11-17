// The archive of past shows (C-43, C-47): one year's past productions, newest year first, or those
// found by title, company or a public credit. "Not found" while past shows are not public, and
// nothing before public-site.archive.from-year.
import { getQuery } from 'h3'
import { defineRoute, refuse, useSetting } from '#kit'
import { pastProductions } from '#modules/core'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  if (!await useSetting('public-site.archive.public')) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  const query = getQuery(event) as Record<string, string | string[] | undefined>
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const year = Number(one(query.year))
  const q = one(query.q)?.slice(0, 200) // not-policy: a bound on what is read of the query
  return pastProductions({
    year: Number.isInteger(year) ? year : undefined,
    q,
    fromYear: await useSetting('public-site.archive.from-year') as number | null,
  })
})
