import { can, manageMembers, verifyAccessProfiles } from '#shared/utils/abilities'
import { NAV_COUNTS } from '#shared/utils/site-nav'
import type { NavCount, NavEntry } from '#shared/utils/site-nav'

// Each counted queue, read through its own list route: the route's default filter is the waiting set.
const QUEUES: Record<NavCount, { ability: NavEntry['ability'], route: string }> = {
  'membership-claims': { ability: manageMembers, route: '/api/admin/memberships/claims' },
  'access-profiles': { ability: verifyAccessProfiles, route: '/api/admin/access-profiles' },
}

// The queues counted on the console sidebar, shared so a screen that works one can refresh the
// count the sidebar shows (A-130 criterion 11). Fetched only for somebody who can decide them.
export function useNavCounts() {
  const counts = useState<Partial<Record<NavCount, number>>>('nav-counts', () => ({}))
  const viewer = useViewer()

  async function refresh(): Promise<void> {
    const read: Partial<Record<NavCount, number>> = {}
    await Promise.all(NAV_COUNTS.filter(count => can(viewer.value, QUEUES[count].ability)).map(async (count) => {
      try {
        read[count] = (await $fetch<{ total: number }>(QUEUES[count].route, { query: { pageSize: 1 } })).total
      }
      catch {
        // A count that cannot be read is left off rather than shown as nought.
      }
    }))
    counts.value = read
  }

  return { counts, refresh }
}
