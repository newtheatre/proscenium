export interface AccountSnapshot {
  signedIn: boolean
  user?: { id: string, name: string, email: string, verified: boolean }
}

// The account row is the source of truth, not the sealed cookie (0007), so this reads the route
// that re-reads it rather than useUserSession(), which would read the cookie.
export function useAccount(): { account: Ref<AccountSnapshot>, refresh: () => Promise<void> } {
  const account = useState<AccountSnapshot>('nnt-account', () => ({ signedIn: false }))

  async function refresh(): Promise<void> {
    account.value = await $fetch('/api/auth/session')
  }

  // useState and not useAsyncData: async data is cleared when the component that asked for it
  // unmounts, so signing in and then navigating would lose the answer it had just fetched.
  return { account, refresh }
}
