export interface TableRow {
  id?: string | number
  [key: string]: unknown
}

export interface Column<T extends TableRow = TableRow> {
  key: string
  label: string
  sortable?: boolean
  searchable?: boolean
  render?: (value: unknown, row: T) => string
  class?: string
}

export interface FilterOption {
  value: string | number | boolean | null
  label: string
}

export interface Filter {
  key: string
  label: string
  type: 'select' | 'boolean' | 'text'
  options?: FilterOption[]
}

export interface Pagination {
  page: number
  pages: number
  count: number
}

export interface ApiResponse<T extends TableRow = TableRow> {
  success: boolean
  data: T[]
  meta: Pagination
  error?: string
}

export interface TableQueryParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  [key: string]: string | number | boolean | null | undefined
}

export interface TableProps<T extends TableRow = TableRow> {
  apiEndpoint: string
  columns: Column<T>[]
  filters?: Filter[]
  searchPlaceholder?: string
  emptyMessage?: string
  defaultSortBy?: string
  defaultSortOrder?: 'asc' | 'desc'
  defaultPerPage?: number
}

// Common filter options that can be reused
export const CommonFilterOptions = {
  boolean: [
    { value: true, label: 'Yes' },
    { value: false, label: 'No' },
  ] as const,

  userRoles: [
    { value: 'ADMIN', label: 'Admin' },
    { value: 'MANAGER', label: 'Manager' },
    { value: 'TRAINER', label: 'Trainer' },
  ] as const,

  membershipTypes: [
    { value: 'FULL', label: 'Full' },
    { value: 'ASSOCIATE', label: 'Associate' },
    { value: 'FELLOW', label: 'Fellow' },
    { value: 'ALUMNI', label: 'Alumni' },
    { value: 'GUEST', label: 'Guest' },
    { value: 'UNKNOWN', label: 'Unknown' },
  ] as const,

  sortOrders: [
    { value: 'asc', label: 'Ascending' },
    { value: 'desc', label: 'Descending' },
  ] as const,
}

// Helper functions for common renderers
export const CommonRenderers = {
  date: (value: unknown): string => {
    if (!value || typeof value !== 'string') return '-'
    return new Date(value).toLocaleDateString()
  },

  datetime: (value: unknown): string => {
    if (!value || typeof value !== 'string') return '-'
    return new Date(value).toLocaleString()
  },

  boolean: (value: unknown): string => {
    return value ? 'Yes' : 'No'
  },

  status: (value: unknown): string => {
    return value ? 'Active' : 'Inactive'
  },

  array: (value: unknown): string => {
    if (!Array.isArray(value) || value.length === 0) return '-'
    return value.map(String).join(', ')
  },

  email: (value: unknown): string => {
    if (!value || typeof value !== 'string') return '-'
    return value
  },

  truncate: (maxLength = 50) => (value: unknown): string => {
    if (!value || typeof value !== 'string') return '-'
    if (value.length <= maxLength) return value
    return value.substring(0, maxLength) + '...'
  },

  capitalize: (value: unknown): string => {
    if (!value || typeof value !== 'string') return '-'
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
  },
}
