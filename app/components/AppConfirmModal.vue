/**
 * Confirmation dialog for a destructive action. Use it through `useConfirm()`
 * rather than mounting it directly; `close` is emitted with the answer.
 */
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  confirmColor?: 'error' | 'warning' | 'primary' | 'neutral'
  cancelLabel?: string
  icon?: string
  // Managed by useOverlay when opened programmatically.
  open?: boolean
}>(), {
  confirmLabel: 'Confirm',
  confirmColor: 'error',
  cancelLabel: 'Cancel',
  icon: 'i-lucide-triangle-alert',
  open: false,
})

const emit = defineEmits<{
  close: [value: boolean]
}>()

const localOpen = computed({
  get: () => props.open,
  set: (value: boolean) => {
    if (!value) emit('close', false)
  },
})
</script>

<template>
  <UModal
    v-model:open="localOpen"
    :title="title"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <UAlert
        v-if="description"
        :description="description"
        :icon="icon"
        color="error"
        variant="subtle"
      />
    </template>

    <template #footer>
      <UButton
        :label="cancelLabel"
        color="neutral"
        variant="outline"
        @click="emit('close', false)"
      />
      <UButton
        :label="confirmLabel"
        :color="confirmColor"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
