/**
 * Generic Confirm Modal Component
 *
 * A reusable destructive-action confirmation dialog.
 * Intended to be used programmatically via the `useConfirm` composable.
 *
 * @props title        - Modal heading
 * @props description  - Supporting text shown below the heading
 * @props confirmLabel - Label for the confirm button (default: "Confirm")
 * @props confirmColor - Color for the confirm button (default: "error")
 * @props cancelLabel  - Label for the cancel button (default: "Cancel")
 * @props icon         - Icon shown in the modal header
 * @emits close        - Emitted with `true` (confirmed) or `false` (cancelled)
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
