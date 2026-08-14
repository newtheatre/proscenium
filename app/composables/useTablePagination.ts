import { computed, ref } from '#imports'
import type { PaginationState } from '@tanstack/table-core'

/**
 * Client-side pagination state for a `UTable`, and a 1-based `page` to bind to
 * `AdminTablePagination`.
 *
 * **Every write replaces the state object rather than mutating it.** That is
 * the whole point of this composable: `UTable` exposes pagination through a
 * getter, so TanStack tracks the ref, not the `pageIndex` inside it. Mutating
 * in place changes the number without notifying TanStack, and the table keeps
 * rendering page 1 while the pager highlights page 2 (ADR-0012).
 *
 * @example
 * const { pagination, page, resetPage } = useTablePagination(20)
 * watch([search, showArchived], resetPage)
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
