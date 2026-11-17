// The app's own fetch, `$api`, used for every request to the site's API: `useAPI()` for data a
// screen loads and `useNuxtApp().$api()` for an act. Nuxt's global `$fetch` is left as it is, since
// modules rely on it behaving as documented.
//
// In the browser `$api` confirms it is you in place when the server asks (ID-28): a refusal of
// "confirm it is you" opens the dialogue, and once the person confirms, the request is sent again,
// once. A screen therefore needs nothing of its own to get this. The dialogue's own requests are
// left alone, so a refusal there cannot open a second dialogue. On the server it is the request's
// own fetch, which carries the visitor's cookies to the API.
import type { FetchOptions } from 'ofetch'
import { CONFIRM_REASONS, type ConfirmReason } from '../composables/useConfirmItsYou'

const OWN = '/api/core/me/reassert'

// Nitro types `$fetch` over every route of the app. With about two hundred routes that union outgrows
// the compiler ("Type instantiation is excessively deep"), so `$api` takes any address and the caller
// says what it expects back. Nitro's typed `$fetch` stays as it is for modules that want it.
export interface Api {
  <T = unknown>(request: string, options?: FetchOptions): Promise<T>
  raw: typeof globalThis.$fetch.raw
  create: typeof globalThis.$fetch.create
}
type Fetch = Api

export default defineNuxtPlugin(() => {
  if (import.meta.server) return { provide: { api: useRequestFetch() as Fetch } }

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
  }) as unknown as Fetch
  // `raw` and `create` are the plain fetch's: only a call to `$api` itself confirms and retries.
  Object.assign(api, { raw: base.raw, create: base.create })
  return { provide: { api } }
})
