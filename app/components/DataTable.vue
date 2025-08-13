<template>
  <div class="data-table">
    <!-- Search and Filters -->
    <div class="table-controls">
      <div class="table-controls__top">
        <TableSearch
          v-model="searchQuery"
          :placeholder="searchPlaceholder"
          @search="handleSearch"
        />

        <TableFilters
          v-if="filters.length > 0"
          :filters="filters"
          :values="filterValues"
          @update="handleFiltersUpdate"
          @clear="handleFiltersClear"
        />
      </div>
    </div>

    <!-- Table -->
    <div class="table-container">
      <table class="table">
        <TableHeader
          :columns="computedColumns"
          :sort-by="sortBy"
          :sort-order="sortOrder"
          :enable-selection="enableSelection"
          :select-all="selectAll"
          @sort="handleSort"
          @toggle-select-all="toggleSelectAll"
        />

        <TableBody
          :data="data"
          :columns="computedColumns"
          :loading="loading"
          :empty-message="emptyMessage"
        />
      </table>

      <!-- Pagination -->
      <TablePagination
        v-if="pagination && pagination.pages > 1"
        :current-page="pagination.page"
        :total-pages="pagination.pages"
        :total-count="pagination.count"
        :per-page="perPage"
        @page-change="handlePageChange"
        @per-page-change="handlePerPageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends TableRow">
import { defineComponent, h, ref, computed, watch, onMounted, onUnmounted, readonly } from 'vue'
import type { TableRow, Column, Filter, Pagination, ApiResponse, TableQueryParams } from './table/types'
import FormCheckbox from './form/FormCheckbox.vue'

interface Props {
  apiEndpoint: string
  columns: Column<T>[]
  filters?: Filter[]
  searchPlaceholder?: string
  emptyMessage?: string
  defaultSortBy?: string
  defaultSortOrder?: 'asc' | 'desc'
  defaultPerPage?: number
  enableSelection?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  filters: () => [],
  searchPlaceholder: 'Search...',
  emptyMessage: 'No data available',
  defaultSortBy: 'createdAt',
  defaultSortOrder: 'desc',
  defaultPerPage: 10,
  enableSelection: false,
})

// Reactive state
const data = ref<T[]>([]) as Ref<T[]>
const loading = ref(false)
const pagination = ref<Pagination | null>(null)

// Selection state
const selectedRows = ref<Set<string | number>>(new Set())
const selectAll = ref(false)

// Loading delay to prevent flicker for fast API calls
// - Standard operations (search, filters): 150ms delay
// - Fast operations (sort, pagination): 50ms delay
// - If the request completes before the delay, loading state never shows
let loadingTimeout: ReturnType<typeof setTimeout> | null = null

// Methods
const fetchData = async (showLoading = true, loadingDelay = 150) => {
  // Clear any existing timeout
  if (loadingTimeout) {
    clearTimeout(loadingTimeout)
    loadingTimeout = null
  }

  // Set loading with delay to prevent flicker for fast requests
  if (showLoading) {
    loadingTimeout = setTimeout(() => {
      loading.value = true
      loadingTimeout = null
    }, loadingDelay)
  }

  try {
    const response = await $fetch<ApiResponse<T>>(props.apiEndpoint, {
      query: queryParams.value,
    })

    if (response.success) {
      data.value = response.data as T[]
      pagination.value = response.meta
    }
    else {
      console.error('API returned success: false')
      data.value = []
      pagination.value = null
    }
  }
  catch (error) {
    console.error('Failed to fetch data:', error)
    data.value = []
    pagination.value = null
  }
  finally {
    // Clear timeout and loading state
    if (loadingTimeout) {
      clearTimeout(loadingTimeout)
      loadingTimeout = null
    }
    loading.value = false
  }
}

// Query parameters
const searchQuery = ref('')
const filterValues = ref<Record<string, string | number | boolean | null>>({})
const sortBy = ref(props.defaultSortBy)
const sortOrder = ref<'asc' | 'desc'>(props.defaultSortOrder)
const currentPage = ref(1)
const perPage = ref(props.defaultPerPage)

// Computed
const queryParams = computed((): TableQueryParams => {
  const params: TableQueryParams = {
    page: currentPage.value,
    limit: perPage.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
  }

  if (searchQuery.value) {
    params.search = searchQuery.value
  }

  // Add filter values
  Object.entries(filterValues.value).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      params[key] = value
    }
  })

  return params
})

// Computed columns with optional selection column
const computedColumns = computed(() => {
  if (!props.enableSelection) {
    return props.columns
  }

  const selectionColumn: Column<T> = {
    key: '_selection',
    label: '',
    sortable: false,
    class: 'selection-column',
    component: defineComponent({
      props: {
        row: { type: Object, required: true },
        value: { type: null, required: false },
      },
      setup(componentProps) {
        const row = componentProps.row as T
        const rowId = row.id
        const isSelected = computed(() => rowId ? selectedRows.value.has(rowId) : false)

        const toggleRow = (checked: boolean) => {
          if (rowId && checked) {
            selectedRows.value.add(rowId)
          }
          else if (rowId) {
            selectedRows.value.delete(rowId)
          }

          // Update select all state
          selectAll.value = data.value.length > 0
            && data.value.every((row) => {
              return row.id && selectedRows.value.has(row.id)
            })
        }

        return () => h(FormCheckbox, {
          'id': `row-checkbox-${rowId}`,
          'modelValue': isSelected.value,
          'onUpdate:modelValue': toggleRow,
          'class': 'row-checkbox',
        })
      },
    }),
  }

  return [selectionColumn, ...props.columns]
})

// Selection methods
const toggleSelectAll = () => {
  if (selectAll.value) {
    selectedRows.value.clear()
    selectAll.value = false
  }
  else {
    data.value.forEach((row) => {
      if (row.id) selectedRows.value.add(row.id)
    })
    selectAll.value = true
  }
}

const clearSelection = () => {
  selectedRows.value.clear()
  selectAll.value = false
}

// Watch for data changes to update select all state
watch(data, () => {
  if (data.value.length === 0) {
    selectAll.value = false
  }
  else {
    selectAll.value = data.value.every((row) => {
      return row.id && selectedRows.value.has(row.id)
    })
  }
}, { deep: true })

// Expose selection methods and state for parent components
defineExpose({
  selectedRows: readonly(selectedRows),
  clearSelection,
  selectAll: readonly(selectAll),
  toggleSelectAll,
})

const handleSearch = (query: string) => {
  searchQuery.value = query
  currentPage.value = 1
  fetchData()
}

const handleSort = (column: string) => {
  if (sortBy.value === column) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortBy.value = column
    sortOrder.value = 'asc'
  }
  currentPage.value = 1
  // Use shorter delay for sorting since it's typically fast
  fetchData(true, 50)
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  // Use shorter delay for pagination since it's typically fast
  fetchData(true, 50)
}

const handlePerPageChange = (newPerPage: number) => {
  perPage.value = newPerPage
  currentPage.value = 1
  fetchData()
}

const handleFiltersUpdate = (filters: Record<string, string | number | boolean | null>) => {
  filterValues.value = { ...filters }
  currentPage.value = 1
  fetchData()
}

const handleFiltersClear = () => {
  filterValues.value = {}
  currentPage.value = 1
  fetchData()
}

// Initialize
onMounted(() => {
  fetchData()
})

// Cleanup
onUnmounted(() => {
  if (loadingTimeout) {
    clearTimeout(loadingTimeout)
    loadingTimeout = null
  }
})

// Watch for prop changes
watch(() => props.apiEndpoint, () => {
  fetchData()
}, { immediate: false })
</script>

<style scoped>
.data-table {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  width: 100%;
}

.table-controls {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.table-controls__top {
  display: flex;
  flex-direction: row;
  gap: var(--spacing-md);
  align-items: flex-start;
  flex-wrap: wrap;
}

.table-container {
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background-color: var(--primary-bg-color);
  overflow: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background-color: var(--primary-bg-color);
}

@media (max-width: 768px) {
  .table-controls {
    gap: 12px;
  }

  .table-controls__top {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}

/* Selection styles */
:deep(.selection-column) {
  width: 40px;
  text-align: center;
  vertical-align: middle;
}

/* Override FormCheckbox styles for table usage */
:deep(.selection-column .form-field) {
  margin-bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

:deep(.selection-column .form-group) {
  margin-bottom: 0;
  justify-content: center;
  align-items: center;
  height: auto;
}

:deep(.selection-column .form-group label) {
  display: none; /* Hide the label in table context */
}

:deep(.selection-column .form-group input[type="checkbox"]) {
  margin: 0;
}
</style>
