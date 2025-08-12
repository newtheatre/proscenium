<template>
  <div class="table-filters">
    <div class="filters-container">
      <div
        v-for="filter in filters"
        :key="filter.key"
        class="filter-group"
      >
        <!-- Select Filter -->
        <FormSelect
          v-if="filter.type === 'select'"
          :id="`filter-${filter.key}`"
          :model-value="String(filterValues[filter.key] ?? '')"
          :label="filter.label"
          :options="getSelectOptions(filter)"
          placeholder="All"
          @update:model-value="(value) => updateFilterValue(filter.key, value)"
        />

        <!-- Boolean Filter -->
        <FormSelect
          v-else-if="filter.type === 'boolean'"
          :id="`filter-${filter.key}`"
          :model-value="String(filterValues[filter.key] ?? '')"
          :label="filter.label"
          :options="booleanOptions"
          placeholder="All"
          @update:model-value="(value) => updateFilterValue(filter.key, value)"
        />

        <!-- Text Filter -->
        <FormInput
          v-else-if="filter.type === 'text'"
          :id="`filter-${filter.key}`"
          :model-value="String(filterValues[filter.key] ?? '')"
          :label="filter.label"
          type="text"
          :placeholder="`Filter by ${filter.label.toLowerCase()}`"
          @update:model-value="(value) => updateFilterValue(filter.key, value)"
        />
      </div>
    </div>

    <div class="filter-actions">
      <FormButton
        v-if="hasActiveFilters"
        type="button"
        variant="ghost"
        :full-width="false"
        @click="clearFilters"
      >
        Clear Filters
      </FormButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import FormInput from '~/components/form/FormInput.vue'
import FormSelect from '~/components/form/FormSelect.vue'
import FormButton from '~/components/form/FormButton.vue'

interface FilterOption {
  value: string | number | boolean | null
  label: string
}

interface Filter {
  key: string
  label: string
  type: 'select' | 'boolean' | 'text'
  options?: FilterOption[]
}

interface Props {
  filters: Filter[]
  values: Record<string, string | number | boolean | null>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  update: [filters: Record<string, string | number | boolean | null>]
  clear: []
}>()

const filterValues = ref<Record<string, string | number | boolean | null>>({ ...props.values })

// Watch for external changes to values
watch(() => props.values, (newValues) => {
  filterValues.value = { ...newValues }
}, { deep: true })

const hasActiveFilters = computed(() => {
  return Object.values(filterValues.value).some(value =>
    value !== null && value !== undefined && value !== '',
  )
})

// Boolean options for boolean filters
const booleanOptions = [
  { label: 'Yes', value: 'true' },
  { label: 'No', value: 'false' },
]

// Convert filter options to FormSelect format
const getSelectOptions = (filter: Filter) => {
  if (!filter.options) return []
  return filter.options.map(option => ({
    label: option.label,
    value: String(option.value ?? ''),
  }))
}

const updateFilterValue = (key: string, value: string | number) => {
  if (value === '' || value === null || value === undefined) {
    filterValues.value[key] = null
  }
  else {
    filterValues.value[key] = value
  }
  handleFilterChange()
}

const handleFilterChange = () => {
  // Clean up filter values - remove empty strings, null, undefined
  const cleanedFilters = Object.entries(filterValues.value).reduce((acc, [key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      acc[key] = value
    }
    return acc
  }, {} as Record<string, string | number | boolean | null>)

  emit('update', cleanedFilters)
}

const clearFilters = () => {
  filterValues.value = {}
  emit('clear')
}
</script>

<style scoped>
.table-filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-width: 300px;
  height: max-content;
}

.filters-container {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-group {
  min-width: 140px;
  flex: 1;
}

.filter-group :deep(.form-field) {
  margin-bottom: 0;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.filter-actions :deep(.ui-button) {
  min-width: auto;
  width: auto;
  padding: var(--spacing-xs) 12px;
  font-size: 12px;
}

@media (max-width: 768px) {
  .table-filters {
    min-width: auto;
  }

  .filters-container {
    flex-direction: column;
  }

  .filter-group {
    min-width: auto;
  }
}
</style>
