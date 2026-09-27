import { viewerFromSession } from '#shared/utils/viewer-facts'
import type { Viewer } from '#shared/utils/abilities'

// The viewer an ability is checked against in the chrome. The same shape the server resolver
// builds, from the account snapshot rather than from the cookie (0007, 0009).
export function useViewer(): ComputedRef<Viewer | null> {
  const { account } = useAccount()
  return computed(() => {
    const { signedIn, user, ...facts } = account.value
    if (!signedIn || !user) return null
    return viewerFromSession(user.id, facts)
  })
}
