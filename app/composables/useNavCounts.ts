import { can, manageMembers, verifyAccessProfiles } from '#shared/utils/abilities'
import type { Viewer } from '#shared/utils/abilities'
import type { NavCount } from '#shared/utils/site-nav'
import type { BouncerAbility } from 'nuxt-authorization/utils'

// Each counted queue, read through its own list route: the route's default filter is the waiting set.
const QUEUES: { count: NavCount, ability: BouncerAbility<Viewer>, route: string }[] = [
  { count: 'membership-claims', ability: manageMembers, route: '/api/admin/memberships/claims' },
  { count: 'access-profiles', ability: verifyAccessProfiles, route: '/api/admin/access-profiles' },
]

// The queues counted on the console sidebar, shared so a screen that works one can refresh the
// count the sidebar shows (A-130 criterion 11). Fetched only for somebody who can decide them.
export function useNavCounts() {
  const counts = useState<Partial<Record<NavCount, number>>>('nav-counts', () => ({}))
  const viewer = useViewer()

  async function refresh(): Promise<void> {
    const read: Partial<Record<NavCount, number>> = {}
    await Promise.all(QUEUES.filter(queue => can(viewer.value, queue.ability)).map(async (queue) => {
      try {
        read[queue.count] = (await $fetch<{ total: number }>(queue.route, { query: { pageSize: 1 } })).total
      }
      catch {
        // A count that cannot be read is left off rather than shown as nought.
      }
    }))
    counts.value = read
  }

  return { counts, refresh }
}
