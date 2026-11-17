// The theatre's old addresses (C-45): a request for one named in site/content/redirects.yml goes on
// to its new address with a permanent redirect, before any page is drawn. The list is part of the
// build, so it is read once and kept.
import { defineEventHandler, getRequestURL, sendRedirect } from 'h3'
import { queryCollection } from '@nuxt/content/server'
import { findRedirect, type Redirect } from '../../shared/redirects'

/**
 * Addresses that are never an old page: the API, stored files, and the build's and frameworks' own
 * (anything under /_ or /__, such as Nuxt Content's /__nuxt_content, whose own reads would otherwise
 * wait on this one).
 */
const NEVER = /^\/(api|files|cdn-cgi)(\/|$)|^\/_/

// The list once read, never the promise reading it: a Worker may not settle one request's promise in another.
let loaded: Redirect[] | null = null

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') return
  const url = getRequestURL(event)
  if (NEVER.test(url.pathname)) return
  if (!(event.context as { cloudflare?: { env?: { DB?: unknown } } }).cloudflare?.env?.DB) return // prerendering
  if (!loaded) {
    // The collection's types are generated for the app only, so the server names it loosely.
    const file = await queryCollection(event, 'redirects' as never).first() as { redirects?: Redirect[] } | null
    loaded = file?.redirects ?? []
  }
  const redirect = findRedirect(loaded, url.pathname, url.search)
  if (redirect) return sendRedirect(event, redirect.to, 301) // not-policy: HTTP's permanent redirect
})
