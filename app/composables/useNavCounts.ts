import { can, manageMembers } from '#shared/utils/abilities'
import type { NavCount } from '#shared/utils/site-nav'

// The queues counted on the console sidebar, shared so a screen that works one can refresh the
// count the sidebar shows (A-130 criterion 11). Fetched only for somebody who can decide them.
export function useNavCounts() {
  const counts = useState<Partial<Record<NavCount, number>>>('nav-counts', () => ({}))
  const viewer = useViewer()

  async function refresh(): Promise<void> {
    if (!can(viewer.value, manageMembers)) {
      counts.value = {}
      return
    }
    try {
      const answer = await $fetch<{ total: number }>('/api/admin/memberships/claims', { query: { pageSize: 1 } })
      counts.value = { ...counts.value, 'membership-claims': answer.total }
    }
    catch {
      // A count that cannot be read is left off rather than shown as nought.
      counts.value = {}
    }
  }

  return { counts, refresh }
}
