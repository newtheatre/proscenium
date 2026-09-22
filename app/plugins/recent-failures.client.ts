import { rememberFailure } from '#shared/utils/feedback'
import type { RecentFailure } from '#shared/utils/feedback'

// The last few things the browser saw go wrong, attached to a report so a bug can be found in the
// worker's logs by its ray id (K-134 criterion 2). Failures a screen caught and explained are not seen.
export default defineNuxtPlugin((nuxtApp) => {
  const failures = useState<RecentFailure[]>('nnt-recent-failures', () => [])

  function remember(failure: RecentFailure): void {
    failures.value = rememberFailure(failures.value, failure)
  }

  // ofetch's FetchError, recognised by shape: a request and a response rather than a class, so no
  // import of the fetch library's internals is needed here.
  function fromError(error: unknown): RecentFailure | null {
    const at = Math.floor(Date.now() / 1000)
    const failed = error as { request?: unknown, response?: Response, statusMessage?: string, message?: string } | null
    if (failed && typeof failed === 'object' && 'request' in failed && 'response' in failed) {
      return {
        path: new URL(String(failed.request ?? '/'), window.location.origin).pathname.slice(0, 200),
        status: failed.response?.status ?? 0,
        message: (failed.statusMessage ?? failed.message ?? '').slice(0, 200),
        ray: failed.response?.headers.get('cf-ray') ?? undefined,
        at,
      }
    }
    if (error instanceof Error) {
      return { path: window.location.pathname.slice(0, 200), status: 0, message: error.message.slice(0, 200), at }
    }
    return null
  }

  nuxtApp.hook('vue:error', (error) => {
    const failure = fromError(error)
    if (failure) remember(failure)
  })
  nuxtApp.hook('app:error', (error) => {
    const failure = fromError(error)
    if (failure) remember(failure)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const failure = fromError(event.reason)
    if (failure) remember(failure)
  })
})
