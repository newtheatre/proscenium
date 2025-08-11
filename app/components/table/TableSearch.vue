<template>
  <div class="table-search">
    <FormInput
      id="table-search"
      v-model="searchValue"
      type="search"
      label="Search"
      :placeholder="placeholder"
      @update:model-value="handleInput"
    />
  </div>
</template>

<script setup lang="ts">
import FormInput from '~/components/form/FormInput.vue'

interface Props {
  modelValue: string
  placeholder?: string
  debounceMs?: number
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Search...',
  debounceMs: 300,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'search': [query: string]
}>()

const searchValue = ref(props.modelValue)
let debounceTimeout: NodeJS.Timeout | null = null

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  searchValue.value = newValue
})

const handleInput = (value: string) => {
  searchValue.value = value
  emit('update:modelValue', value)

  // Clear existing timeout
  if (debounceTimeout) {
    clearTimeout(debounceTimeout)
  }

  // Set new timeout for debounced search
  debounceTimeout = setTimeout(() => {
    emit('search', value)
  }, props.debounceMs)
}

// Cleanup timeout on unmount
onUnmounted(() => {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout)
  }
})
</script>

<style scoped>
.table-search {
  flex: 1;
  min-width: 250px;
  max-width: 400px;
}

.table-search :deep(.form-field) {
  margin-bottom: 0;
}

@media (max-width: 768px) {
  .table-search {
    max-width: none;
    min-width: auto;
  }
}
</style>
