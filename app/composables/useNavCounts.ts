import type { NavCount } from '#shared/utils/site-nav'

// The sidebar's and the overview's counts, one request holding only the queues the caller decides;
// a screen that works one refreshes it, so the sidebar moves too (A-130 criterion 11, issue 1358).
export function useNavCounts() {
  const counts = useState<Partial<Record<NavCount, number>>>('nav-counts', () => ({}))
  // A failed read leaves every count off, so the overview says so rather than showing none waiting.
  const failed = useState<boolean>('nav-counts-failed', () => false)

  async function refresh(): Promise<void> {
    try {
      counts.value = (await $fetch<{ counts: Partial<Record<NavCount, number>> }>('/api/admin/waiting')).counts
      failed.value = false
    }
    catch {
      counts.value = {}
      failed.value = true
    }
  }

  return { counts, failed, refresh }
}
