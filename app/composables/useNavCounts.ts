import type { NavCount } from '#shared/utils/site-nav'
import type { ListFailure } from '~/composables/useListFailure'

// The sidebar's and the overview's counts, one request holding only the queues the caller decides;
// a screen that works one refreshes it, so the sidebar moves too (A-130 criterion 11, issue 1358).
export function useNavCounts() {
  const counts = useState<Partial<Record<NavCount, number>>>('nav-counts', () => ({}))
  // A failed read leaves every count off, so the overview says why rather than showing none waiting.
  const failure = useState<ListFailure | null>('nav-counts-failure', () => null)
  const failed = computed(() => failure.value !== null)

  async function refresh(): Promise<void> {
    try {
      counts.value = (await $fetch<{ counts: Partial<Record<NavCount, number>> }>('/api/admin/waiting')).counts
      failure.value = null
    }
    catch (error) {
      counts.value = {}
      failure.value = listFailureFrom(error, 'What is waiting could not be read.')
    }
  }

  return { counts, failed, failure, refresh }
}
