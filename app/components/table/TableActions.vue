<template>
  <div class="table-actions">
    <UIButton
      v-for="action in actions"
      :key="action.key"
      :variant="action.variant || 'primary'"
      @click="() => handleAction(action)"
    >
      {{ action.label }}
    </UIButton>
  </div>
</template>

<script setup lang="ts">
import type { TableAction } from './types'

interface Props {
  row: {
    id?: string | number
    uid?: string | number
    [key: string]: unknown
  }
  value?: unknown
  actions: TableAction[]
}

const props = defineProps<Props>()

const handleAction = (action: TableAction) => {
  if (action.handler) {
    action.handler(props.row)
  }
  else if (action.path) {
    const userId = props.row.id || props.row.uid
    const path = action.path.replace('{id}', String(userId))
    navigateTo(path)
  }
}
</script>

<style scoped>
.table-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-start;
}

@media (max-width: 1024px) {
  .table-actions {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
