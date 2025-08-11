import type { ApiResponse, TableQueryParams, Pagination, TableRow } from '~/components/table/types'

export interface UseTableOptions {
  apiEndpoint: string
  defaultSortBy?: string
  defaultSortOrder?: 'asc' | 'desc'
  defaultPerPage?: number
  autoFetch?: boolean
}

export interface UseTableReturn<T extends TableRow = TableRow> {
  data: Ref<T[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  pagination: Ref<Pagination | null>

  // Query state
  searchQuery: Ref<string>
  filterValues: Ref<Record<string, string | number | boolean | null>>
  sortBy: Ref<string>
  sortOrder: Ref<'asc' | 'desc'>
  currentPage: Ref<number>
  perPage: Ref<number>

  // Methods
  fetchData: () => Promise<void>
  setSearch: (query: string) => void
  setFilters: (filters: Record<string, string | number | boolean | null>) => void
  clearFilters: () => void
  setSort: (field: string, order?: 'asc' | 'desc') => void
  setPage: (page: number) => void
  setPerPage: (limit: number) => void
  refresh: () => Promise<void>

  // Computed
  queryParams: ComputedRef<TableQueryParams>
  hasData: ComputedRef<boolean>
  hasFilters: ComputedRef<boolean>
  totalPages: ComputedRef<number>
}

export function useTable<T extends TableRow = TableRow>(options: UseTableOptions): UseTableReturn<T> {
  const {
    apiEndpoint,
    defaultSortBy = 'createdAt',
    defaultSortOrder = 'desc',
    defaultPerPage = 10,
    autoFetch = true,
  } = options

  // State
  const data = ref([]) as Ref<T[]>
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pagination = ref<Pagination | null>(null)

  // Query parameters
  const searchQuery = ref('')
  const filterValues = ref<Record<string, string | number | boolean | null>>({})
  const sortBy = ref(defaultSortBy)
  const sortOrder = ref<'asc' | 'desc'>(defaultSortOrder)
  const currentPage = ref(1)
  const perPage = ref(defaultPerPage)

  // Computed
  const queryParams = computed(() => {
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

  const hasData = computed(() => data.value.length > 0)

  const hasFilters = computed(() => {
    return Object.values(filterValues.value).some(value =>
      value !== null && value !== undefined && value !== '',
    )
  })

  const totalPages = computed(() => pagination.value?.pages || 0)

  // Methods
  const fetchData = async () => {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<ApiResponse<T>>(apiEndpoint, {
        query: queryParams.value,
      })

      if (response.success) {
        data.value = (response.data || []) as T[]
        pagination.value = response.meta || null
      }
      else {
        error.value = response.error || 'Failed to fetch data'
        data.value = []
        pagination.value = null
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch data'
      data.value = []
      pagination.value = null
      console.error('Table fetch error:', err)
    }
    finally {
      loading.value = false
    }
  }

  const setSearch = (query: string) => {
    searchQuery.value = query
    currentPage.value = 1
    if (autoFetch) fetchData()
  }

  const setFilters = (filters: Record<string, string | number | boolean | null>) => {
    filterValues.value = { ...filters }
    currentPage.value = 1
    if (autoFetch) fetchData()
  }

  const clearFilters = () => {
    filterValues.value = {}
    currentPage.value = 1
    if (autoFetch) fetchData()
  }

  const setSort = (field: string, order?: 'asc' | 'desc') => {
    if (sortBy.value === field && !order) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    }
    else {
      sortBy.value = field
      sortOrder.value = order || 'asc'
    }
    currentPage.value = 1
    if (autoFetch) fetchData()
  }

  const setPage = (page: number) => {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page
      if (autoFetch) fetchData()
    }
  }

  const setPerPage = (limit: number) => {
    perPage.value = limit
    currentPage.value = 1
    if (autoFetch) fetchData()
  }

  const refresh = () => fetchData()

  // Auto-fetch on mount
  if (autoFetch) {
    onMounted(() => {
      fetchData()
    })
  }

  return {
    // State
    data,
    loading,
    error,
    pagination,

    // Query state
    searchQuery,
    filterValues,
    sortBy,
    sortOrder,
    currentPage,
    perPage,

    // Methods
    fetchData,
    setSearch,
    setFilters,
    clearFilters,
    setSort,
    setPage,
    setPerPage,
    refresh,

    // Computed
    queryParams,
    hasData,
    hasFilters,
    totalPages,
  }
}
