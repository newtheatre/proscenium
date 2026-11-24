// The app's own fetch, `$api`, used for every request to the site's API: `useAPI()` for data a
// screen loads and `useNuxtApp().$api()` for an act. Nuxt's global `$fetch` is left as it is, since
// modules rely on it behaving as documented.
//
// In the browser `$api` confirms it is you in place when the server asks (ID-28): a refusal of
// "confirm it is you" opens the dialogue, and once the person confirms, the request is sent again,
// once. A screen therefore needs nothing of its own to get this. The dialogue's own requests are
// left alone, so a refusal there cannot open a second dialogue. A refusal that says two-step sign-in
// is not set up cannot be confirmed: the dialogue says where to set it up, and nothing is sent again. On the server it is the request's
// own fetch, which carries the visitor's cookies to the API.
//
// Every write sent from the browser carries an Idempotency-Key, made here when the screen gave none,
// so a route that requires one (`idempotent: true`) works from any screen without each screen
// remembering to send it. The key is made once per call and sent again with the retry after
// confirming, so a write that did reach the server is replayed rather than done twice.
//
// On a practice page (Practice mode, M1, M5) every request carries the practice mark, on the server
// render too, so the server answers from the person's practice store. There the confirm-it's-you
// dialogue is the pretend one, a change refreshes the panel so its tasks tick, and an ended session
// opens the Ended screen.
import type { FetchOptions, ResponseType } from 'ofetch'
import { isPracticePath } from '../../shared/practice'
import { CONFIRM_REASONS, type ConfirmReason } from '../composables/useConfirmItsYou'
import { withIdempotencyKey } from '../utils/idempotency'
import { withPracticeMark } from '../utils/practice'

const OWN = '/api/core/me/reassert'
const path = (request: unknown) => typeof request === 'string' ? request : ''

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
  if (import.meta.server) {
    const fetch = useRequestFetch() as unknown as Api
    if (!isPracticePath(useRequestURL().pathname)) return { provide: { api: fetch } }
    const marked = ((request: string, options?: FetchOptions<ResponseType>) => fetch(request, withPracticeMark(options))) as Api
    return { provide: { api: Object.assign(marked, { raw: fetch.raw, create: fetch.create }) } }
  }

  const { confirmItsYou } = useConfirmItsYou()
  const practice = usePracticeSignals()
  const router = useRouter()
  const base = globalThis.$fetch
  // Typed loosely inside: the typed fetch compares every route, which is too deep to restate here.
  const send = base as unknown as (request: unknown, options?: unknown) => Promise<unknown>
  /** A refused request: sent again once the person confirms it is them, or the refusal thrown on. */
  async function recover(error: unknown, request: unknown, options: unknown, practising: boolean): Promise<unknown> {
    const e = error as { statusCode?: number, data?: { code?: string } | null }
    const code = e?.data?.code
    if (practising && code === 'core.practice.ended') {
      practice.ended()
      throw error
    }
    // Two-step sign-in not set up: an act says so over the page and is not sent again. A load only
    // shows the refusal where its data would be, with the same way to set it up.
    if (e?.statusCode === 403 && code === TWO_STEP_NOT_SET_UP && !path(request).startsWith(OWN)) {
      const method = String((options as { method?: string } | undefined)?.method ?? 'GET').toUpperCase()
      if (method !== 'GET' && method !== 'HEAD') await confirmItsYou(TWO_STEP_NOT_SET_UP)
      throw error
    }
    if (e?.statusCode !== 403 || !code || !CONFIRM_REASONS.includes(code) || path(request).startsWith(OWN)) throw error
    if (!(await (practising ? practice.confirm() : confirmItsYou(code as ConfirmReason)))) throw error
    return send(request, options)
  }

  const api = (async (request: unknown, given?: unknown) => {
    const practising = isPracticePath(router.currentRoute.value.path)
    const options = practising ? withPracticeMark(withIdempotencyKey(given)) : withIdempotencyKey(given)
    try {
      const answer = await send(request, options)
      if (practising) practice.changed(path(request), options)
      return answer
    }
    catch (error) {
      return recover(error, request, options, practising)
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
