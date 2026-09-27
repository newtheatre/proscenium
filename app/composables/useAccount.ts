import { NO_SESSION_FACTS } from '#shared/utils/viewer-facts'
import type { SessionFacts } from '#shared/utils/viewer-facts'

// What `GET /api/auth/session` answers, typed from the answer itself so the client never lists
// the facts a second time. The permissions are what the chrome filters by, never the guard (0009).
export interface AccountSnapshot extends SessionFacts {
  signedIn: boolean
  user?: { id: string, name: string, email: string, verified: boolean }
}

// The account row is the source of truth, not the sealed cookie (0007), so this reads the route
// that re-reads it rather than useUserSession(), which would read the cookie.
export function useAccount(): { account: Ref<AccountSnapshot>, refresh: () => Promise<void> } {
  const account = useState<AccountSnapshot>('nnt-account', () => ({ signedIn: false, ...NO_SESSION_FACTS }))
  // Plain $fetch sends none of the incoming request's headers while rendering, so every
  // server-side read would report nobody signed in.
  const request = useRequestFetch()

  async function refresh(): Promise<void> {
    const answer = await request('/api/auth/session')
    account.value = { ...NO_SESSION_FACTS, ...answer }
  }

  // useState and not useAsyncData: async data is cleared when the component that asked for it
  // unmounts, so signing in and then navigating would lose the answer it had just fetched.
  return { account, refresh }
}
