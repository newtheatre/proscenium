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
          :columns="columns"
          :sort-by="sortBy"
          :sort-order="sortOrder"
          @sort="handleSort"
        />

        <TableBody
          :data="data"
          :columns="columns"
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
import type { TableRow, Column, Filter, Pagination, ApiResponse, TableQueryParams } from './table/types'

interface Props {
  apiEndpoint: string
  columns: Column<T>[]
  filters?: Filter[]
  searchPlaceholder?: string
  emptyMessage?: string
  defaultSortBy?: string
  defaultSortOrder?: 'asc' | 'desc'
  defaultPerPage?: number
}

const props = withDefaults(defineProps<Props>(), {
  filters: () => [],
  searchPlaceholder: 'Search...',
  emptyMessage: 'No data available',
  defaultSortBy: 'createdAt',
  defaultSortOrder: 'desc',
  defaultPerPage: 10,
})

// Reactive state
const data = ref<T[]>([]) as Ref<T[]>
const loading = ref(false)
const pagination = ref<Pagination | null>(null)

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

// Methods
const fetchData = async () => {
  loading.value = true

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
    loading.value = false
  }
}

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
  fetchData()
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchData()
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

// Watch for prop changes
watch(() => props.apiEndpoint, () => {
  fetchData()
}, { immediate: false })
</script>

<style scoped>
.data-table {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.table-controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.table-controls__top {
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.table-container {
  border: 1px solid #404040;
  border-radius: 0.5rem;
  background-color: var(--primary-bg-color);
  overflow: hidden;
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

  .table-container {
    overflow-x: auto;
  }
}
</style>
