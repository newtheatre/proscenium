// The app's own fetch, `$api`, used for every request to the site's API: `useAPI()` for data a
// screen loads and `useNuxtApp().$api()` for an act. Nuxt's global `$fetch` is left as it is, since
// modules rely on it behaving as documented.
//
// In the browser `$api` confirms it is you in place when the server asks (ID-28): a refusal of
// "confirm it is you" opens the dialogue, and once the person confirms, the request is sent again,
// once. A screen therefore needs nothing of its own to get this. The dialogue's own requests are
// left alone, so a refusal there cannot open a second dialogue. On the server it is the request's
// own fetch, which carries the visitor's cookies to the API.
import type { FetchOptions, ResponseType } from 'ofetch'
import { CONFIRM_REASONS, type ConfirmReason } from '../composables/useConfirmItsYou'

const OWN = '/api/core/me/reassert'

type Fetch = typeof globalThis.$fetch

/**
 * `$api` as screens see it: a path and options in, the answer out, with the answer's type named by
 * the caller (`$api<Order>(...)`). It is deliberately not Nitro's typed fetch, which matches the
 * path against every route of the site: with a few hundred routes that comparison passes the
 * compiler's depth limit, and which call fails first moves each time a route is added.
 */
export interface Api {
  <T = unknown>(request: string, options?: FetchOptions<ResponseType>): Promise<T>
  raw: Fetch['raw']
  create: Fetch['create']
}

export default defineNuxtPlugin(() => {
  if (import.meta.server) return { provide: { api: useRequestFetch() as unknown as Api } }

  const { confirmItsYou } = useConfirmItsYou()
  const base = globalThis.$fetch
  // Typed loosely inside: the typed fetch compares every route, which is too deep to restate here.
  const send = base as unknown as (request: unknown, options?: unknown) => Promise<unknown>
  const api = (async (request: unknown, options?: unknown) => {
    try {
      return await send(request, options)
    }
    catch (error) {
      const e = error as { statusCode?: number, data?: { code?: string } | null }
      const code = e?.data?.code
      const path = typeof request === 'string' ? request : ''
      if (e?.statusCode !== 403 || !code || !CONFIRM_REASONS.includes(code) || path.startsWith(OWN)) throw error
      if (!(await confirmItsYou(code as ConfirmReason))) throw error
      return send(request, options)
    }
  }) as unknown as Api
  // `raw` and `create` are the plain fetch's: only a call to `$api` itself confirms and retries.
  Object.assign(api, { raw: base.raw, create: base.create })

  // A server render cannot ask anyone to confirm, so a screen reloaded while its loads need a
  // recent sign-in arrives with those loads refused. Once the page is in the browser they are sent
  // again through `$api`, which opens the dialogue (one for them all) and fills the screen after.
  const nuxtApp = useNuxtApp()
  if (nuxtApp.payload.serverRendered) {
    nuxtApp.hooks.hookOnce('app:suspense:resolve', () => {
      const refused = Object.entries(nuxtApp.payload._errors ?? {})
        .filter(([, error]) => {
          const e = error as { statusCode?: number, data?: { code?: string } | null } | null | undefined
          return e?.statusCode === 403 && !!e.data?.code && CONFIRM_REASONS.includes(e.data.code)
        })
        .map(([key]) => key)
      if (refused.length) void refreshNuxtData(refused)
    })
  }
  return { provide: { api } }
})
