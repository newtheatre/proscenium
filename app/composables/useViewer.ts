import type { Viewer } from '#shared/utils/abilities'

// The viewer an ability is checked against in the chrome. The same shape the server resolver
// builds, from the account snapshot rather than from the cookie (0007, 0009).
export function useViewer(): ComputedRef<Viewer | null> {
  const { account } = useAccount()
  return computed(() => {
    const user = account.value.user
    if (!account.value.signedIn || !user) return null
    return {
      id: user.id,
      permissions: account.value.permissions,
      onShiftTonight: account.value.onShiftTonight,
      leadsDepartment: account.value.leadsDepartment,
      isTrainer: account.value.isTrainer,
    }
  })
}
