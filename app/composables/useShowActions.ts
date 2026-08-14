import type { PerformanceListItem, ShowListItem, ShowStatus } from '~~/shared/types/shows'
import { readonly, ref, useToast } from '#imports'
import { formatDateTime } from '~/utils/format'
import { useConfirm } from '~/composables/useConfirm'

/**
 * The destructive and status-changing operations on shows and performances, so
 * the list and the detail page do the same thing — including asking the same
 * question first, via `useConfirm()`.
 *
 * `onChanged` runs after any successful mutation, so the caller decides what to
 * refresh: one list, three tabs, or a detail page.
 */
export function useShowActions(onChanged: () => void | Promise<void>) {
  const toast = useToast()
  const confirm = useConfirm()

  /** True while any of these is in flight, for disabling a row's controls. */
  const busy = ref(false)

  async function run(action: () => Promise<void>, failureTitle: string) {
    if (busy.value) return
    busy.value = true
    try {
      await action()
      await onChanged()
    }
    catch (error: unknown) {
      toast.add({
        title: failureTitle,
        description: getErrorMessage(error, 'Please try again'),
        icon: 'i-lucide-x-circle',
        color: 'error',
      })
    }
    finally {
      busy.value = false
    }
  }

  async function deleteShow(show: ShowListItem) {
    const count = show.performanceCount ?? show.performances?.length ?? 0
    const confirmed = await confirm({
      title: `Delete '${show.title}'?`,
      description: count
        ? `This permanently deletes the show and all ${count} of its performances. It cannot be undone.`
        : 'This permanently deletes the show. It cannot be undone.',
      confirmLabel: 'Delete show',
      confirmColor: 'error',
    })
    if (!confirmed) return

    await run(async () => {
      await $fetch(`/api/shows/${show.id}`, { method: 'DELETE' })
      toast.add({
        title: 'Show deleted',
        description: `"${show.title}" and all its performances have been removed`,
        icon: 'i-lucide-check',
        color: 'success',
      })
    }, 'Failed to delete show')
  }

  async function deletePerformance(performance: PerformanceListItem) {
    const confirmed = await confirm({
      title: 'Delete performance?',
      description: `${formatDateTime(performance.startsAt)}. This cannot be undone, and will be refused if tickets have already been issued for it.`,
      confirmLabel: 'Delete performance',
      confirmColor: 'error',
    })
    if (!confirmed) return

    await run(async () => {
      await $fetch(`/api/shows/${performance.showId}/performances/${performance.id}`, { method: 'DELETE' })
      toast.add({
        title: 'Performance deleted',
        description: `${formatDateTime(performance.startsAt)} has been removed`,
        icon: 'i-lucide-check',
        color: 'success',
      })
    }, 'Failed to delete performance')
  }

  async function cancelPerformance(performance: PerformanceListItem) {
    await run(async () => {
      await $fetch(`/api/shows/${performance.showId}/performances/${performance.id}`, {
        method: 'PUT',
        body: { status: 'CANCELLED' },
      })
      toast.add({ title: 'Performance cancelled', icon: 'i-lucide-check', color: 'success' })
    }, 'Failed to cancel performance')
  }

  /**
   * Back on sale — or back to draft, if the show itself is not published. A
   * reinstated performance must never be more public than its show.
   */
  async function reinstatePerformance(performance: PerformanceListItem, showStatus: ShowStatus) {
    await run(async () => {
      await $fetch(`/api/shows/${performance.showId}/performances/${performance.id}`, {
        method: 'PUT',
        body: { status: showStatus === 'PUBLISHED' ? 'ON_SALE' : 'DRAFT' },
      })
      toast.add({ title: 'Performance reinstated', icon: 'i-lucide-check', color: 'success' })
    }, 'Failed to reinstate performance')
  }

  return {
    busy: readonly(busy),
    deleteShow,
    deletePerformance,
    cancelPerformance,
    reinstatePerformance,
  }
}
