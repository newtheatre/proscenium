import { computed, ref } from '#imports'
import type { PaginationState } from '@tanstack/table-core'

/**
 * Client-side pagination state for a `UTable`, and a 1-based `page` to bind to
 * `AdminTablePagination`.
 *
 * **Every write replaces the state object rather than mutating it.** That is the
 * whole point of this composable, and it is not stylistic. `UTable` exposes the
 * pagination state through a getter — `state: { get pagination() { return
 * paginationState.value } }` — so what TanStack tracks is the *ref*, not the
 * `pageIndex` inside it. Assigning `pagination.value.pageIndex = 1` changes the
 * number without changing the object, TanStack is never notified, and the table
 * keeps rendering the first page while the pager helpfully highlights page 2.
 *
 * That was the bug on /admin/ticket-types, /admin/venues and
 * /admin/content-warnings: clicking a page did nothing. The same mutation also
 * sat in each page's "reset to page 1 when the search changes" watcher, so
 * filtering could strand you on a page number the filtered set no longer has.
 *
 * @example
 * const { pagination, page, resetPage } = useTablePagination(20)
 * watch([search, showArchived], resetPage)
 *
 * // <UTable v-model:pagination="pagination" :pagination-options="paginationOptions" …>
 * // <AdminTablePagination v-model:page="page" :limit="pagination.pageSize" … />
 */
export function useTablePagination(pageSize: number) {
  const pagination = ref<PaginationState>({ pageIndex: 0, pageSize })

  /** 1-based, because `UPagination` counts from 1 and TanStack indexes from 0. */
  const page = computed({
    get: () => pagination.value.pageIndex + 1,
    set: (value: number) => {
      pagination.value = { ...pagination.value, pageIndex: Math.max(0, value - 1) }
    },
  })

  /** Back to the first page — for when a filter changes what "page 3" means. */
  function resetPage() {
    if (pagination.value.pageIndex === 0) return
    pagination.value = { ...pagination.value, pageIndex: 0 }
  }

  return { pagination, page, resetPage }
}
