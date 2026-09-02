import type { Permission } from '#shared/utils/roles'

export interface AccountSnapshot {
  signedIn: boolean
  user?: { id: string, name: string, email: string, verified: boolean }
  // What the chrome filters itself by. Empty for a signed-out caller, and never the guard: the
  // server refuses on its own account (0009).
  permissions: Permission[]
  onShiftTonight: boolean
  leadsDepartment: boolean
  isTrainer: boolean
}

// The account row is the source of truth, not the sealed cookie (0007), so this reads the route
// that re-reads it rather than useUserSession(), which would read the cookie.
export function useAccount(): { account: Ref<AccountSnapshot>, refresh: () => Promise<void> } {
  const account = useState<AccountSnapshot>('nnt-account', () => ({
    signedIn: false,
    permissions: [],
    onShiftTonight: false,
    leadsDepartment: false,
    isTrainer: false,
  }))
  // Plain $fetch sends none of the incoming request's headers while rendering, so every
  // server-side read would report nobody signed in.
  const request = useRequestFetch()

  async function refresh(): Promise<void> {
    const answer = await request('/api/auth/session')
    account.value = { permissions: [], onShiftTonight: false, leadsDepartment: false, isTrainer: false, ...answer }
  }

  // useState and not useAsyncData: async data is cleared when the component that asked for it
  // unmounts, so signing in and then navigating would lose the answer it had just fetched.
  return { account, refresh }
}
