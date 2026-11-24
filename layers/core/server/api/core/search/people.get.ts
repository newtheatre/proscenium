// The command palette's search for people (core.search-source): the person picker's search, by
// name or by an address typed in full. Offered to whoever may open a person's page.
import { getQuery } from 'nuxt/server'
import { defineRoute } from '#kit'
import { searchAccounts } from '../../../identity/search'

export default defineRoute({ ability: 'core.account.read', rateLimit: 'default' }, async (event) => {
  const q = String(getQuery(event).q ?? '').slice(0, 120).trim() // not-policy: shape bound
  if (q.length < 3) return { ids: [] } // not-policy: the search index needs three letters
  return { ids: (await searchAccounts(q)).map(p => p.id) }
})
