import { computed, ref } from '#imports'
import type { PaginationState } from '@tanstack/table-core'

/**
 * Pagination state for a UTable. **Every write replaces the state object** —
 * mutating it does not notify TanStack (ADR-0012).
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
