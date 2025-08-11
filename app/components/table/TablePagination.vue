<template>
  <div class="table-pagination">
    <div class="pagination-info">
      <span class="info-text">
        Showing <strong>{{ startItem }}</strong> to <strong>{{ endItem }}</strong> of <strong>{{ totalCount }}</strong> entries
      </span>

      <div class="pagination-selectors">
        <div class="per-page-selector">
          <FormSelect
            id="perPage"
            :model-value="String(perPage)"
            label="Items per page"
            :options="pageSizeOptions.map(size => ({ value: String(size), label: String(size) }))"
            @update:model-value="handlePerPageChange"
          />
        </div>

        <div
          v-if="totalPages > 10"
          class="page-jump-selector"
        >
          <FormSelect
            id="pageJump"
            :model-value="String(currentPage)"
            label="Jump to page"
            :options="Array.from({ length: totalPages }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))"
            @update:model-value="handlePageJump"
          />
        </div>
      </div>
    </div>

    <div class="pagination-controls">
      <button
        :disabled="currentPage === 1"
        class="pagination-button pagination-button--nav"
        type="button"
        aria-label="Go to first page"
        @click="goToPage(1)"
      >
        <span class="pagination-icon">⟪</span>
        <span class="pagination-text">First</span>
      </button>

      <button
        :disabled="currentPage === 1"
        class="pagination-button pagination-button--nav"
        type="button"
        aria-label="Go to previous page"
        @click="goToPage(currentPage - 1)"
      >
        <span class="pagination-icon">‹</span>
        <span class="pagination-text">Previous</span>
      </button>

      <div class="page-numbers">
        <button
          v-for="page in visiblePages"
          :key="page"
          :class="[
            'page-number',
            { active: page === currentPage },
          ]"
          type="button"
          :aria-label="`Go to page ${page}`"
          :aria-current="page === currentPage ? 'page' : undefined"
          @click="goToPage(page)"
        >
          {{ page }}
        </button>
      </div>

      <button
        :disabled="currentPage === totalPages"
        class="pagination-button pagination-button--nav"
        type="button"
        aria-label="Go to next page"
        @click="goToPage(currentPage + 1)"
      >
        <span class="pagination-text">Next</span>
        <span class="pagination-icon">›</span>
      </button>

      <button
        :disabled="currentPage === totalPages"
        class="pagination-button pagination-button--nav"
        type="button"
        aria-label="Go to last page"
        @click="goToPage(totalPages)"
      >
        <span class="pagination-text">Last</span>
        <span class="pagination-icon">⟫</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import FormSelect from '~/components/form/FormSelect.vue'

interface Props {
  currentPage: number
  totalPages: number
  totalCount: number
  perPage: number
  pageSizeOptions?: number[]
  maxVisiblePages?: number
}

const props = withDefaults(defineProps<Props>(), {
  pageSizeOptions: () => [10, 25, 50, 100],
  maxVisiblePages: 7,
})

const emit = defineEmits<{
  'page-change': [page: number]
  'per-page-change': [perPage: number]
}>()

const startItem = computed(() => {
  return (props.currentPage - 1) * props.perPage + 1
})

const endItem = computed(() => {
  return Math.min(props.currentPage * props.perPage, props.totalCount)
})

const visiblePages = computed(() => {
  const pages: number[] = []
  const { currentPage, totalPages, maxVisiblePages } = props

  if (totalPages <= maxVisiblePages) {
    // Show all pages if total is less than max visible
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i)
    }
  }
  else {
    // Show a range around current page
    const halfVisible = Math.floor(maxVisiblePages / 2)
    let startPage = Math.max(1, currentPage - halfVisible)
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

    // Adjust if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1)
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i)
    }
  }

  return pages
})

const goToPage = (page: number) => {
  if (page >= 1 && page <= props.totalPages && page !== props.currentPage) {
    emit('page-change', page)
  }
}

const handlePerPageChange = (value: string | number) => {
  const newPerPage = typeof value === 'string' ? parseInt(value, 10) : value
  emit('per-page-change', newPerPage)
}

const handlePageJump = (value: string | number) => {
  const page = typeof value === 'string' ? parseInt(value, 10) : value
  goToPage(page)
}
</script>

<style scoped>
.table-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  gap: 24px;
  flex-wrap: wrap;
  background-color: var(--header-bg-color);
  border-top: 1px solid #404040;
  border-bottom-left-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
  margin: 0;
  position: relative;
}

.pagination-info {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.info-text {
  font-size: 14px;
  color: var(--primary-text-color);
  font-weight: 500;
}

.per-page-selector {
  min-width: 140px;
}

.page-jump-selector {
  min-width: 120px;
}

.pagination-selectors {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.per-page-selector :deep(.form-field),
.page-jump-selector :deep(.form-field) {
  margin-bottom: 0;
}

.per-page-selector :deep(.form-label),
.page-jump-selector :deep(.form-label) {
  font-size: 12px;
  margin-bottom: 4px;
  color: var(--primary-text-color);
  opacity: 0.8;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pagination-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: 1px solid #404040;
  background-color: var(--primary-bg-color);
  color: var(--primary-text-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.pagination-button:hover:not(:disabled) {
  background-color: var(--header-bg-color);
  border-color: var(--nnt-orange);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.pagination-button:active:not(:disabled) {
  transform: translateY(0);
}

.pagination-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.pagination-button--nav {
  min-width: 80px;
}

.pagination-icon {
  font-size: 16px;
  font-weight: bold;
}

.pagination-text {
  font-size: 13px;
}

.page-numbers {
  display: flex;
  gap: 4px;
  margin: 0 8px;
}

.page-number {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  border: 1px solid #404040;
  background-color: var(--primary-bg-color);
  color: var(--primary-text-color);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  min-width: 44px;
  height: 44px;
  transition: all 0.2s ease;
}

.page-number:hover {
  background-color: var(--header-bg-color);
  border-color: var(--nnt-orange);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.page-number.active {
  background-color: var(--nnt-orange);
  border-color: var(--nnt-orange);
  color: var(--alt-text-color);
  font-weight: 600;
  transform: none;
  box-shadow: 0 2px 8px rgba(255, 196, 37, 0.3);
}

.page-number.active:hover {
  background-color: var(--nnt-orange-dark);
  border-color: var(--nnt-orange-dark);
  transform: none;
}

@media (max-width: 768px) {
  .table-pagination {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
    padding: 16px;
  }

  .pagination-info {
    justify-content: center;
    text-align: center;
    flex-direction: column;
    gap: 12px;
  }

  .pagination-selectors {
    justify-content: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .per-page-selector,
  .page-jump-selector {
    min-width: 110px;
    flex: 1;
  }

  .pagination-controls {
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .page-numbers {
    flex-wrap: wrap;
    justify-content: center;
  }

  .pagination-button--nav .pagination-text {
    display: none;
  }

  .pagination-button--nav {
    min-width: 44px;
    padding: 10px;
  }

  .page-numbers {
    order: -1;
    justify-content: center;
    margin: 0;
    overflow-x: auto;
    padding: 0 4px;
  }

  .per-page-selector,
  .page-jump-selector {
    min-width: 110px;
  }

  .pagination-selectors {
    gap: 12px;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .pagination-info {
    flex-direction: column;
    gap: 12px;
  }

  .info-text {
    font-size: 12px;
  }

  .page-numbers {
    gap: 2px;
  }

  .page-number {
    min-width: 36px;
    height: 36px;
    padding: 8px;
    font-size: 12px;
  }

  .pagination-button {
    padding: 8px;
    font-size: 12px;
  }
}
</style>
