<template>
  <tbody>
    <!-- Loading State -->
    <tr
      v-if="loading"
      class="loading-row"
    >
      <td
        :colspan="columns.length"
        class="loading-cell"
      >
        <div class="loading-spinner">
          <div class="spinner" />
          <span>Loading...</span>
        </div>
      </td>
    </tr>

    <!-- Empty State -->
    <tr
      v-else-if="!data || data.length === 0"
      class="empty-row"
    >
      <td
        :colspan="columns.length"
        class="empty-cell"
      >
        {{ emptyMessage }}
      </td>
    </tr>

    <!-- Data Rows -->
    <tr
      v-for="(row, index) in data"
      v-else
      :key="getRowKey(row, index)"
      class="data-row"
    >
      <td
        v-for="column in columns"
        :key="column.key"
        :class="column.class"
        class="data-cell"
      >
        <div>{{ getCellContent(row, column) }}</div>
      </td>
    </tr>
  </tbody>
</template>

<script setup lang="ts" generic="T extends TableRow">
import type { TableRow, Column } from './types'

interface Props {
  data: T[]
  columns: Column<T>[]
  loading: boolean
  emptyMessage: string
}

defineProps<Props>()

const getRowKey = (row: T, index: number): string | number => {
  return row.id ?? index
}

const getCellContent = (row: T, column: Column<T>): string => {
  if (column.render) {
    return column.render(getNestedValue(row, column.key), row)
  }

  const value = getNestedValue(row, column.key)
  return formatValue(value)
}

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  return path.split('.').reduce((current: unknown, key: string): unknown => {
    if (current && typeof current === 'object' && current !== null && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key]
    }
    return null
  }, obj)
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '-'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(String).join(', ') : '-'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}
</script>

<style scoped>
tbody {
  background-color: var(--primary-bg-color);
}

.data-row {
  border-bottom: 1px solid var(--border-color);
  transition: background-color var(--transition-fast);
}

.data-row:hover {
  background-color: var(--header-bg-color);
}

.data-cell {
  padding: 12px var(--spacing-md);
  vertical-align: top;
  color: var(--primary-text-color);
}

.loading-row,
.empty-row {
  border-bottom: none;
}

.loading-cell,
.empty-cell {
  padding: 40px var(--spacing-md);
  text-align: center;
  color: var(--secondary-text-color);
}

.loading-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-top: 2px solid var(--nnt-orange);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
