// The theatre's old addresses (C-45): which redirect, if any, a request for an address takes. Pure,
// so the server's middleware and the check share it.

export interface Redirect { from: string, to: string }

/** An address as an entry names it: no trailing slash (but "/"), and its query kept as written. */
export function normaliseFrom(address: string): string {
  const [path = '', query] = address.split('?', 2) as [string, string | undefined]
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') : path
  return query === undefined ? trimmed : `${trimmed}?${query}`
}

/** The entry for a request: one naming the whole address with its query first, else its path alone. */
export function findRedirect(redirects: readonly Redirect[], pathname: string, search = ''): Redirect | undefined {
  const path = normaliseFrom(pathname)
  const withQuery = search && search !== '?' ? `${path}${search.startsWith('?') ? search : `?${search}`}` : null
  return (withQuery ? redirects.find(r => normaliseFrom(r.from) === withQuery) : undefined)
    ?? redirects.find(r => normaliseFrom(r.from) === path)
}
