<template>
  <thead>
    <tr>
      <th
        v-for="column in columns"
        :key="column.key"
        :class="[
          column.class,
          {
            'sortable': column.sortable,
            'sorted': sortBy === column.key,
            'sorted-asc': sortBy === column.key && sortOrder === 'asc',
            'sorted-desc': sortBy === column.key && sortOrder === 'desc',
            'selection-header': column.key === '_selection',
          },
        ]"
        @click="column.sortable && handleSort(column.key)"
      >
        <div
          v-if="column.key === '_selection'"
          class="selection-header-content"
        >
          <FormCheckbox
            id="select-all-checkbox"
            :model-value="selectAll"
            class="select-all-checkbox"
            @update:model-value="$emit('toggle-select-all')"
          />
        </div>
        <div
          v-else
          class="header-content"
        >
          <span>{{ column.label }}</span>
          <span
            v-if="column.sortable"
            class="sort-indicator"
            :class="{
              active: sortBy === column.key,
            }"
          >
            <span
              class="sort-arrow sort-asc"
              :class="{ active: sortBy === column.key && sortOrder === 'asc' }"
            >↑</span>
            <span
              class="sort-arrow sort-desc"
              :class="{ active: sortBy === column.key && sortOrder === 'desc' }"
            >↓</span>
          </span>
        </div>
      </th>
    </tr>
  </thead>
</template>

<script setup lang="ts" generic="T extends TableRow">
import type { TableRow, Column } from './types'
import FormCheckbox from '../form/FormCheckbox.vue'

interface Props {
  columns: Column<T>[]
  sortBy: string
  sortOrder: 'asc' | 'desc'
  enableSelection?: boolean
  selectAll?: boolean
}

interface Emits {
  'sort': [column: string]
  'toggle-select-all': []
}

withDefaults(defineProps<Props>(), {
  enableSelection: false,
  selectAll: false,
})

const emit = defineEmits<Emits>()

const handleSort = (column: string) => {
  emit('sort', column)
}
</script>

<style scoped>
thead {
  background-color: var(--header-bg-color);
}

th {
  padding: 12px var(--spacing-md);
  text-align: left;
  font-weight: 600;
  color: var(--primary-text-color);
  border-bottom: 2px solid var(--border-color);
  white-space: nowrap;
}

th.sortable {
  cursor: pointer;
  user-select: none;
}

th.sortable:hover {
  background-color: rgba(255, 196, 37, 0.1);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-xs);
}

.sort-indicator {
  display: flex;
  flex-direction: column;
  opacity: 0.3;
  transition: opacity var(--transition-fast);
}

.sort-indicator.active {
  opacity: 1;
}

.sortable:hover .sort-indicator {
  opacity: 0.6;
}

.sort-arrow {
  font-size: 12px;
  line-height: 1;
  color: var(--secondary-text-color);
  transition: color var(--transition-fast);
}

.sort-arrow.active {
  color: var(--nnt-orange);
}

th.sorted {
  background-color: rgba(255, 196, 37, 0.1);
}

/* Selection column styles */
.selection-header {
  width: 40px;
  text-align: center;
  vertical-align: middle;
}

.selection-header-content {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

/* Override FormCheckbox styles for table header usage */
:deep(.selection-header .form-field) {
  margin-bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

:deep(.selection-header .form-group) {
  margin-bottom: 0;
  justify-content: center;
  align-items: center;
  height: auto;
}

:deep(.selection-header .form-group label) {
  display: none; /* Hide the label in table header context */
}

:deep(.selection-header .form-group input[type="checkbox"]) {
  margin: 0;
}
</style>
